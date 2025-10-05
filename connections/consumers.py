# connections/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db.models import F
from .models import Project, RawElement, QuantityClassificationTag
import asyncio

# --- 데이터 직렬화 헬퍼 함수들 ---
def serialize_tags(tags):
    return [{'id': str(tag.id), 'name': tag.name} for tag in tags]

@database_sync_to_async
def get_total_element_count(project_id):
    try:
        return RawElement.objects.filter(project_id=project_id).count()
    except Project.DoesNotExist:
        return 0

@database_sync_to_async
def get_serialized_element_chunk(project_id, offset, limit):
    try:
        element_chunk_values = list(
            RawElement.objects.filter(project_id=project_id)
            .order_by('id')
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')[offset:offset + limit]
        )
        if not element_chunk_values: return []
        element_ids_in_chunk = [el['id'] for el in element_chunk_values]
        tags_qs = (
            RawElement.classification_tags.through.objects
            .filter(rawelement_id__in=element_ids_in_chunk)
            .values('rawelement_id')
            .annotate(tag_name=F('quantityclassificationtag__name'))
            .values('rawelement_id', 'tag_name')
        )
        tags_by_element_id = {}
        for tag_data in tags_qs:
            el_id = tag_data['rawelement_id']
            if el_id not in tags_by_element_id:
                tags_by_element_id[el_id] = []
            tags_by_element_id[el_id].append(tag_data['tag_name'])
        for element_data in element_chunk_values:
            element_id = element_data['id']
            element_data['classification_tags'] = tags_by_element_id.get(element_id, [])
            element_data['id'] = str(element_id)
            element_data['project_id'] = str(element_data['project_id'])
            element_data['updated_at'] = element_data['updated_at'].isoformat()
        return element_chunk_values
    except Exception as e:
        print(f"Error getting optimized chunk: {e}")
        return []

@database_sync_to_async
def serialize_specific_elements(element_ids):
    try:
        elements_values = list(
            RawElement.objects.filter(id__in=element_ids)
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')
        )
        if not elements_values: return []
        tags_qs = (
            RawElement.classification_tags.through.objects
            .filter(rawelement_id__in=element_ids)
            .values('rawelement_id')
            .annotate(tag_name=F('quantityclassificationtag__name'))
            .values('rawelement_id', 'tag_name')
        )
        tags_by_element_id = {}
        for tag_data in tags_qs:
            el_id = tag_data['rawelement_id']
            if el_id not in tags_by_element_id:
                tags_by_element_id[el_id] = []
            tags_by_element_id[el_id].append(tag_data['tag_name'])
        for element_data in elements_values:
            element_id = element_data['id']
            element_data['classification_tags'] = tags_by_element_id.get(element_id, [])
            element_data['id'] = str(element_id)
            element_data['project_id'] = str(element_data['project_id'])
            element_data['updated_at'] = element_data['updated_at'].isoformat()
        return elements_values
    except Exception as e:
        print(f"Error serializing specific elements: {e}")
        return []


class RevitConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.all_incoming_uids = set()
        self.project_id_for_fetch = None
        path = self.scope['path']
        if 'revit-connector' in path:
            self.group_name = 'revit_broadcast_group'
        elif 'blender-connector' in path:
            self.group_name = 'blender_broadcast_group'
        else:
            self.group_name = None
        
        if self.group_name:
            print(f"✅ [{self.__class__.__name__}] 클라이언트가 '{self.group_name}' 그룹에 참여합니다.")
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name') and self.group_name:
            print(f"❌ [{self.__class__.__name__}] 클라이언트가 '{self.group_name}' 그룹에서 나갑니다.")
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ▼▼▼ [핵심 수정] Blender/Revit에서 오는 메시지를 처리하는 receive 메소드 복원 ▼▼▼
    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        print(f"✉️ [{self.__class__.__name__}] 클라이언트로부터 메시지 수신: type='{msg_type}'")

        if msg_type == 'revit_selection_response':
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name, 
                {'type': 'broadcast_selection', 'unique_ids': data.get('payload', [])}
            )
        elif msg_type == 'fetch_progress_start':
            self.all_incoming_uids.clear()
            self.project_id_for_fetch = data.get('payload', {}).get('project_id')
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
        elif msg_type == 'fetch_progress_update':
            payload = data.get('payload', {})
            project_id = payload.get('project_id')
            elements_data = [json.loads(s) for s in payload.get('elements', [])]
            for item in elements_data:
                if item and 'UniqueId' in item:
                    self.all_incoming_uids.add(item.get('UniqueId'))
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
            if project_id and elements_data:
                await asyncio.shield(self.sync_chunk_of_elements(project_id, elements_data))
        elif msg_type == 'fetch_progress_complete':
            if self.project_id_for_fetch:
                await self.cleanup_old_elements(self.project_id_for_fetch, self.all_incoming_uids)
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
    # ▲▲▲ [핵심 수정] 여기까지 입니다. ▲▲▲

    async def send_command(self, event):
        command_data = event['command_data']
        print(f"➡️  [{self.__class__.__name__}] '{self.group_name}' 그룹의 클라이언트로 명령을 보냅니다: {command_data.get('command')}")
        await self.send(text_data=json.dumps(command_data))

    @database_sync_to_async
    def sync_chunk_of_elements(self, project_id, parsed_data):
        try:
            project = Project.objects.get(id=project_id)
            uids_in_chunk = [item['UniqueId'] for item in parsed_data if item and 'UniqueId' in item]
            existing_elements_map = {el.element_unique_id: el for el in project.raw_elements.filter(element_unique_id__in=uids_in_chunk)}
            to_update, to_create = [], []
            for item in parsed_data:
                if not item or 'UniqueId' not in item: continue
                uid = item['UniqueId']
                if uid in existing_elements_map:
                    elem = existing_elements_map[uid]
                    elem.raw_data = item
                    to_update.append(elem)
                else:
                    to_create.append(RawElement(project=project, element_unique_id=uid, raw_data=item))
            if to_update: RawElement.objects.bulk_update(to_update, ['raw_data'])
            if to_create: RawElement.objects.bulk_create(to_create, ignore_conflicts=True)
        except Exception as e:
            print(f"Error in sync_chunk_of_elements: {e}")

    @database_sync_to_async
    def cleanup_old_elements(self, project_id, incoming_uids):
        try:
            project = Project.objects.get(id=project_id)
            to_delete_uids = set(project.raw_elements.values_list('element_unique_id', flat=True)) - set(incoming_uids)
            if to_delete_uids:
                project.raw_elements.filter(element_unique_id__in=to_delete_uids).delete()
        except Exception as e:
            print(f"Error in cleanup_old_elements: {e}")

class FrontendConsumer(AsyncWebsocketConsumer):
    frontend_group_name = 'frontend_group'
    async def connect(self): await self.channel_layer.group_add(self.frontend_group_name, self.channel_name); await self.accept()
    async def disconnect(self, close_code): await self.channel_layer.group_discard(self.frontend_group_name, self.channel_name)
    
    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        payload = data.get('payload', {})
        print(f"✉️ [{self.__class__.__name__}] 웹 브라우저로부터 메시지 수신: type='{msg_type}'")

        if msg_type == 'command_to_client':
            target_group = payload.pop('target_group', 'revit_broadcast_group')
            print(f"   ➡️  '{target_group}' 그룹으로 명령을 전달합니다: {payload}")
            await self.channel_layer.group_send(target_group, {'type': 'send.command', 'command_data': payload})
        
        elif msg_type == 'get_all_elements':
            project_id = payload.get('project_id')
            if project_id:
                total_elements = await get_total_element_count(project_id)
                await self.send(text_data=json.dumps({'type': 'revit_data_start', 'payload': {'total': total_elements}}))
                CHUNK_SIZE = 1000
                for offset in range(0, total_elements, CHUNK_SIZE):
                    chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)
                    if chunk:
                        await self.send(text_data=json.dumps({'type': 'revit_data_chunk', 'payload': chunk}))
                    await asyncio.sleep(0.01)
                await self.send(text_data=json.dumps({'type': 'revit_data_complete'}))
        
        elif msg_type == 'get_tags':
            project_id = payload.get('project_id')
            if project_id:
                tags = await self.db_get_tags(project_id)
                await self.send_tags_update(tags)
        # ... 이하 다른 msg_type 처리 로직은 기존과 동일 ...
        elif msg_type in ['create_tag', 'update_tag', 'delete_tag']:
            project_id = payload.get('project_id')
            if not project_id: return
            if msg_type == 'create_tag': await self.db_create_tag(project_id, payload.get('name'))
            elif msg_type == 'update_tag': await self.db_update_tag(payload.get('tag_id'), payload.get('new_name'))
            elif msg_type == 'delete_tag': await self.db_delete_tag(payload.get('tag_id'))
            tags = await self.db_get_tags(project_id)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})
        elif msg_type in ['assign_tags', 'clear_tags']:
            element_ids = payload.get('element_ids')
            if msg_type == 'assign_tags': await self.db_assign_tags(payload.get('tag_id'), element_ids)
            elif msg_type == 'clear_tags': await self.db_clear_tags(element_ids)
            elements = await serialize_specific_elements(element_ids)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})

    async def broadcast_progress(self, event): await self.send(text_data=json.dumps(event['data']))
    async def broadcast_tags(self, event): await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': event['tags']}))
    async def broadcast_elements(self, event): await self.send(text_data=json.dumps({'type': 'elements_updated', 'elements': event['elements']}))
    async def broadcast_selection(self, event): await self.send(text_data=json.dumps({'type': 'revit_selection_update', 'unique_ids': event['unique_ids']}))
    async def send_tags_update(self, tags): await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': tags}))

    @database_sync_to_async
    def db_get_tags(self, project_id):
        project = Project.objects.get(id=project_id)
        return serialize_tags(project.classification_tags.all())
    @database_sync_to_async
    def db_create_tag(self, project_id, name):
        if not name: return
        project = Project.objects.get(id=project_id)
        QuantityClassificationTag.objects.get_or_create(project=project, name=name)
    @database_sync_to_async
    def db_update_tag(self, tag_id, new_name):
        if not new_name: return
        tag = QuantityClassificationTag.objects.get(id=tag_id)
        tag.name = new_name; tag.save()
    @database_sync_to_async
    def db_delete_tag(self, tag_id):
        QuantityClassificationTag.objects.filter(id=tag_id).delete()
    @database_sync_to_async
    def db_assign_tags(self, tag_id, element_ids):
        tag = QuantityClassificationTag.objects.get(id=tag_id)
        elements_to_update = RawElement.objects.filter(id__in=element_ids)
        for element in elements_to_update:
            element.classification_tags.add(tag)
    @database_sync_to_async
    def db_clear_tags(self, element_ids):
        elements_to_update = RawElement.objects.filter(id__in=element_ids)
        for element in elements_to_update:
            element.classification_tags.clear()