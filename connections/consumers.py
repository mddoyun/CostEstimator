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

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        payload = data.get('payload', {})
        print(f"\n✉️  [{self.__class__.__name__}] 클라이언트로부터 메시지 수신: type='{msg_type}'")

        if msg_type == 'revit_selection_response':
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name, 
                {'type': 'broadcast_selection', 'unique_ids': payload}
            )
        elif msg_type == 'fetch_progress_start':
            print("[DEBUG] 'fetch_progress_start' 수신. 동기화 세션을 시작합니다.")
            self.all_incoming_uids.clear()
            
            # ▼▼▼ [수정] payload에서 project_id를 가져오는 대신, 이미 저장된 값을 확인합니다. ▼▼▼
            print(f"  - 현재 세션의 프로젝트 ID: {self.project_id_for_fetch}")
            if not self.project_id_for_fetch:
                print("[CRITICAL ERROR] 'fetch_progress_start' 시점에 프로젝트 ID가 설정되지 않았습니다! 동기화가 실패할 수 있습니다.")
            # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

            print(f"  - 전체 객체 수: {payload.get('total_elements')}")
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
        elif msg_type == 'fetch_progress_update':
            print(f"[DEBUG] 'fetch_progress_update' 수신. 처리된 객체: {payload.get('processed_count')}")
            
            # ▼▼▼ [수정] payload의 project_id 대신 self에 저장된 project_id를 사용합니다. ▼▼▼
            project_id = self.project_id_for_fetch
            # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
            
            elements_data = [json.loads(s) for s in payload.get('elements', [])]
            
            chunk_uids = {item['UniqueId'] for item in elements_data if item and 'UniqueId' in item}
            self.all_incoming_uids.update(chunk_uids)
            print(f"  - 이번 청크의 UniqueId {len(chunk_uids)}개 추가. 현재까지 총 {len(self.all_incoming_uids)}개 수신.")

            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
            if project_id and elements_data:
                await asyncio.shield(self.sync_chunk_of_elements(project_id, elements_data))
        
        elif msg_type == 'fetch_progress_complete':
            print("[DEBUG] 'fetch_progress_complete' 수신. 동기화를 마무리하고 삭제 작업을 시작합니다.")
            if self.project_id_for_fetch:
                await self.cleanup_old_elements(self.project_id_for_fetch, self.all_incoming_uids)
            else:
                print("[WARNING] 'project_id_for_fetch'가 설정되지 않아 삭제 작업을 건너뜁니다.")
            
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
        else:
            print(f"[WARNING] 처리되지 않은 메시지 유형입니다: {msg_type}")

    async def send_command(self, event):
        command_data = event['command_data']
        
        # ▼▼▼ [추가] 데이터 가져오기 명령일 경우, project_id를 미리 저장합니다. ▼▼▼
        if command_data.get('command') == 'fetch_all_elements_chunked':
            project_id = command_data.get('project_id')
            self.project_id_for_fetch = project_id
            print(f"🚀 [{self.__class__.__name__}] 데이터 가져오기 세션 시작. Project ID '{project_id}'를 저장합니다.")
        # ▲▲▲ [추가] 여기까지 입니다. ▲▲▲
        
        print(f"➡️  [{self.__class__.__name__}] '{self.group_name}' 그룹의 클라이언트로 명령을 보냅니다: {command_data.get('command')}")
        await self.send(text_data=json.dumps(command_data))

    @database_sync_to_async
    def sync_chunk_of_elements(self, project_id, parsed_data):
        print(f"  [DB Sync] 청크 동기화 시작: {len(parsed_data)}개 객체")
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
            
            if to_update: 
                RawElement.objects.bulk_update(to_update, ['raw_data'])
                print(f"    - {len(to_update)}개 객체 정보 업데이트 완료.")
            if to_create: 
                RawElement.objects.bulk_create(to_create, ignore_conflicts=True)
                print(f"    - {len(to_create)}개 객체 새로 생성 완료.")

        except Exception as e:
            print(f"[ERROR] sync_chunk_of_elements DB 작업 중 오류 발생: {e}")

    @database_sync_to_async
    def cleanup_old_elements(self, project_id, incoming_uids):
        print(f"  [DB Cleanup] 삭제 작업 시작 (Project ID: {project_id})")
        try:
            project = Project.objects.get(id=project_id)
            
            db_uids_qs = project.raw_elements.values_list('element_unique_id', flat=True)
            db_uids = set(db_uids_qs)
            print(f"    - 현재 DB에 존재하는 UniqueId 수: {len(db_uids)}")

            incoming_uids_set = set(incoming_uids)
            print(f"    - 이번 동기화에서 받은 UniqueId 수: {len(incoming_uids_set)}")

            to_delete_uids = db_uids - incoming_uids_set
            print(f"    - 삭제 대상 UniqueId 수: {len(to_delete_uids)}")
            
            if to_delete_uids:
                print(f"    - 삭제 대상 ID (최대 10개 표시): {list(to_delete_uids)[:10]}")
                deleted_count, _ = project.raw_elements.filter(element_unique_id__in=to_delete_uids).delete()
                print(f"    - DB에서 {deleted_count}개의 오래된 RawElement 객체를 성공적으로 삭제했습니다.")
            else:
                print("    - 삭제할 객체가 없습니다. 모든 데이터가 최신 상태입니다.")

        except Exception as e:
            print(f"[ERROR] cleanup_old_elements DB 작업 중 오류 발생: {e}")

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
        
        # ▼▼▼ [수정] get_all_elements 메시지 처리 부분에 print문 추가 ▼▼▼
        elif msg_type == 'get_all_elements':
            project_id = payload.get('project_id')
            if project_id:
                print(f"\n[DEBUG] 프론트엔드로부터 '{project_id}' 프로젝트의 모든 객체 데이터 요청을 받았습니다.")
                total_elements = await get_total_element_count(project_id)
                print(f"[DEBUG] 총 {total_elements}개의 객체를 전송 시작합니다.")
                await self.send(text_data=json.dumps({'type': 'revit_data_start', 'payload': {'total': total_elements}}))
                
                CHUNK_SIZE = 1000
                for offset in range(0, total_elements, CHUNK_SIZE):
                    chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)
                    if chunk:
                        await self.send(text_data=json.dumps({'type': 'revit_data_chunk', 'payload': chunk}))
                    await asyncio.sleep(0.01) # 부하 분산을 위한 약간의 지연
                
                print(f"[DEBUG] {total_elements}개 객체 전송을 완료했습니다.")
                await self.send(text_data=json.dumps({'type': 'revit_data_complete'}))
        # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
        
        elif msg_type == 'get_tags':
            project_id = payload.get('project_id')
            if project_id:
                tags = await self.db_get_tags(project_id)
                await self.send_tags_update(tags)
        
        elif msg_type in ['create_tag', 'update_tag']:
            project_id = payload.get('project_id')
            if not project_id: return
            if msg_type == 'create_tag': await self.db_create_tag(project_id, payload.get('name'))
            elif msg_type == 'update_tag': await self.db_update_tag(payload.get('tag_id'), payload.get('new_name'))
            
            # 생성 또는 수정 후에는 태그 목록만 업데이트하여 브로드캐스트합니다.
            tags = await self.db_get_tags(project_id)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})

        elif msg_type == 'delete_tag':
            project_id = payload.get('project_id')
            tag_id = payload.get('tag_id')
            if not all([project_id, tag_id]): return

            # 1. 태그를 삭제하고, 영향을 받았던 element들의 ID 목록을 가져옵니다.
            affected_ids = await self.db_delete_tag(tag_id)

            # 2. 변경된 전체 태그 목록을 모든 클라이언트에 브로드캐스트합니다.
            tags = await self.db_get_tags(project_id)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})

            # 3. 만약 영향을 받은 element가 있었다면, 해당 element들의 최신 정보를 브로드캐스트합니다.
            if affected_ids:
                elements = await serialize_specific_elements(affected_ids)
                await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})            
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
        """
        태그를 삭제하고, 해당 태그에 영향을 받았던 RawElement의 ID 목록을 반환합니다.
        """
        try:
            # 삭제하기 전에, 어떤 객체들이 이 태그를 가지고 있었는지 ID를 가져옵니다.
            tag_to_delete = QuantityClassificationTag.objects.prefetch_related('raw_elements').get(id=tag_id)
            affected_element_ids = list(tag_to_delete.raw_elements.values_list('id', flat=True))
            
            # 태그를 삭제합니다. (ManyToManyField 관계는 자동으로 정리됩니다)
            tag_to_delete.delete()
            
            return affected_element_ids
        except QuantityClassificationTag.DoesNotExist:
            return [] # 삭제할 태그가 없으면 빈 목록을 반환합니다.
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