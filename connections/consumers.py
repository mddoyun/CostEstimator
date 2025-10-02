# connections/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db.models import prefetch_related_objects
from .models import Project, RawElement, QuantityClassificationTag
import asyncio  # ◀◀◀ [추가] 이 줄을 추가해주세요.
from django.db.models import F

# --- 데이터 직렬화 헬퍼 함수 ---
def serialize_tags(tags):
    return [{'id': str(tag.id), 'name': tag.name} for tag in tags]


# connections/consumers.py

@database_sync_to_async
def get_total_element_count(project_id):
    """프로젝트의 RawElement 전체 개수만 빠르게 가져옵니다."""
    try:
        return RawElement.objects.filter(project_id=project_id).count()
    except Project.DoesNotExist:
        return 0

@database_sync_to_async
def get_serialized_element_chunk(project_id, offset, limit):
    """
    [최적화됨] 지정된 범위의 RawElement를 단 2번의 쿼리로 가져와 직렬화합니다.
    """
    try:
        # 1. 필요한 기본 필드만 지정하여 Chunk 단위로 가져옵니다. (훨씬 가볍고 빠름)
        element_chunk_values = list(
            RawElement.objects.filter(project_id=project_id)
            .order_by('id')
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')[offset:offset + limit]
        )

        if not element_chunk_values:
            return []

        element_ids_in_chunk = [el['id'] for el in element_chunk_values]

        # 2. 이 Chunk에 포함된 모든 Element의 모든 Tag 정보를 단 한 번의 쿼리로 가져옵니다.
        tags_qs = (
            RawElement.classification_tags.through.objects
            .filter(rawelement_id__in=element_ids_in_chunk)
            .values('rawelement_id')
            .annotate(tag_name=F('quantityclassificationtag__name'))
            .values('rawelement_id', 'tag_name')
        )

        # 3. Python에서 두 데이터를 효율적으로 조합합니다. (DB 부하 없음)
        tags_by_element_id = {}
        for tag_data in tags_qs:
            el_id = tag_data['rawelement_id']
            if el_id not in tags_by_element_id:
                tags_by_element_id[el_id] = []
            tags_by_element_id[el_id].append(tag_data['tag_name'])

        # 최종 직렬화된 데이터 생성
        for element_data in element_chunk_values:
            element_id = element_data['id']
            element_data['classification_tags'] = tags_by_element_id.get(element_id, [])

            # JSON으로 보내기 위해 UUID, datetime 객체를 문자열로 변환
            element_data['id'] = str(element_id)
            element_data['project_id'] = str(element_data['project_id'])
            element_data['updated_at'] = element_data['updated_at'].isoformat()

        return element_chunk_values

    except Exception as e:
        print(f"Error getting optimized chunk: {e}")
        return []


# connections/consumers.py

# ... get_serialized_element_chunk 함수 바로 아래에 이 함수를 추가해주세요 ...

@database_sync_to_async
def serialize_specific_elements(element_ids):
    """
    [추가됨] 주어진 element_id 목록에 해당하는 RawElement들만 효율적으로 직렬화합니다.
    """
    try:
        # 1. id 목록을 기반으로 필요한 필드만 가져옵니다.
        elements_values = list(
            RawElement.objects.filter(id__in=element_ids)
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')
        )

        if not elements_values:
            return []

        # 2. 해당 element들의 태그 정보만 한 번의 쿼리로 가져옵니다.
        tags_qs = (
            RawElement.classification_tags.through.objects
            .filter(rawelement_id__in=element_ids)
            .values('rawelement_id')
            .annotate(tag_name=F('quantityclassificationtag__name'))
            .values('rawelement_id', 'tag_name')
        )

        # 3. Python에서 데이터를 조합합니다.
        tags_by_element_id = {}
        for tag_data in tags_qs:
            el_id = tag_data['rawelement_id']
            if el_id not in tags_by_element_id:
                tags_by_element_id[el_id] = []
            tags_by_element_id[el_id].append(tag_data['tag_name'])

        # 최종 데이터 생성
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
    revit_group_name = 'revit_broadcast_group'

    async def connect(self):
        self.all_incoming_uids = set()
        self.project_id_for_fetch = None # 데이터 가져오기 중인 project_id를 저장할 변수
        await self.channel_layer.group_add(self.revit_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.revit_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'revit_data_response': # 기존 동기화 로직 (유지)
            project_id = data.get('project_id')
            payload = [json.loads(s) for s in data.get('payload', [])]
            # 전체 데이터에 대한 동기화 및 정리 작업
            all_uids = {item.get('UniqueId') for item in payload}
            await self.sync_chunk_of_elements(project_id, payload)
            await self.cleanup_old_elements(project_id, all_uids)
            # 프론트엔드로 결과 전송
            db_elements = await self.get_project_elements_from_db(project_id)
            await self.channel_layer.group_send('frontend_group', {'type': 'send_revit_data', 'payload': db_elements})

        elif msg_type == 'revit_selection_response':
            await self.channel_layer.group_send(
                'frontend_group', 
                {'type': 'broadcast_selection', 'unique_ids': data.get('payload', [])}
            )

        elif msg_type == 'fetch_progress_start':
            # 데이터 수신 시작 시, Unique ID 기록 세트를 초기화합니다.
            self.all_incoming_uids.clear()
            # 이후 작업(cleanup)을 위해 project_id를 인스턴스 변수에 저장합니다.
            self.project_id_for_fetch = data.get('payload', {}).get('project_id')
            
            # 프론트엔드로 시작 메시지를 전달합니다.
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )

        elif msg_type == 'fetch_progress_update':
            payload = data.get('payload', {})
            project_id = payload.get('project_id')
            elements_data = [json.loads(s) for s in payload.get('elements', [])]
            
            # 수신된 데이터의 UniqueId를 세트에 기록합니다.
            for item in elements_data:
                if item and 'UniqueId' in item:
                    self.all_incoming_uids.add(item.get('UniqueId'))

            # 프론트엔드로 진행 상황을 그대로 전달합니다.
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
            
            # DB에 데이터 조각을 동기화합니다.
            if project_id and elements_data:
                await asyncio.shield(self.sync_chunk_of_elements(project_id, elements_data))

        elif msg_type == 'fetch_progress_complete':
            # 전송이 모두 완료되면, Revit 모델에 없는 DB 데이터를 삭제합니다.
            if self.project_id_for_fetch:
                await self.cleanup_old_elements(self.project_id_for_fetch, self.all_incoming_uids)
            
            # 프론트엔드로 완료 메시지를 전달합니다.
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )

    async def send_command(self, event):
        await self.send(text_data=json.dumps(event['command_data']))

    @database_sync_to_async
    def sync_chunk_of_elements(self, project_id, parsed_data):
        """분할된 데이터 조각을 받아서 DB에 생성/업데이트합니다."""
        try:
            project = Project.objects.get(id=project_id)
            
            uids_in_chunk = [item['UniqueId'] for item in parsed_data if item and 'UniqueId' in item]
            existing_uids = set(project.raw_elements.filter(
                element_unique_id__in=uids_in_chunk
            ).values_list('element_unique_id', flat=True))

            to_update = []
            to_create = []

            existing_elements_map = {el.element_unique_id: el for el in project.raw_elements.filter(element_unique_id__in=existing_uids)}

            for item in parsed_data:
                if not item or 'UniqueId' not in item:
                    continue
                
                uid = item['UniqueId']
                if uid in existing_uids:
                    elem = existing_elements_map[uid]
                    elem.raw_data = item
                    to_update.append(elem)
                else:
                    to_create.append(RawElement(project=project, element_unique_id=uid, raw_data=item))
            
            if to_update:
                RawElement.objects.bulk_update(to_update, ['raw_data'])
            if to_create:
                RawElement.objects.bulk_create(to_create, ignore_conflicts=True)
        except Project.DoesNotExist:
            # 프로젝트가 없는 경우에 대한 예외 처리
            pass
        except Exception as e:
            # 기타 예외 처리 (로깅 등을 추가할 수 있음)
            print(f"Error in sync_chunk_of_elements: {e}")


    @database_sync_to_async
    def cleanup_old_elements(self, project_id, incoming_uids):
        """전송이 완료된 후, Revit에서 삭제된 객체들을 DB에서 제거합니다."""
        try:
            project = Project.objects.get(id=project_id)
            existing_uids = set(project.raw_elements.values_list('element_unique_id', flat=True))
            
            # set(incoming_uids)으로 한 번 더 감싸서 안전하게 처리
            to_delete_uids = existing_uids - set(incoming_uids)

            if to_delete_uids:
                project.raw_elements.filter(element_unique_id__in=to_delete_uids).delete()
        except Project.DoesNotExist:
            pass
        except Exception as e:
            print(f"Error in cleanup_old_elements: {e}")



    async def get_project_elements_from_db(self, project_id):
        """
        [수정됨] DB의 모든 요소를 가져와서 하나의 리스트로 직렬화하여 반환합니다.
        NOTE: 이 함수는 대용량 데이터 처리 시 메모리를 많이 사용할 수 있습니다.
        """
        total_elements = await get_total_element_count(project_id)
        all_elements = []
        CHUNK_SIZE = 1000  # 일관된 청크 크기 사용
        for offset in range(0, total_elements, CHUNK_SIZE):
            chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)
            if chunk:
                all_elements.extend(chunk)
        return all_elements



class FrontendConsumer(AsyncWebsocketConsumer):
    frontend_group_name = 'frontend_group'
    async def connect(self): await self.channel_layer.group_add(self.frontend_group_name, self.channel_name); await self.accept()
    async def disconnect(self, close_code): await self.channel_layer.group_discard(self.frontend_group_name, self.channel_name)
# connections/consumers.py -> FrontendConsumer 클래스 내부

    # ▼▼▼ [교체] 기존 receive 메서드 전체를 아래 코드로 교체합니다. ▼▼▼
    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        payload = data.get('payload', {})

        if msg_type == 'command_to_revit':
            await self.channel_layer.group_send(RevitConsumer.revit_group_name, {'type': 'send.command', 'command_data': payload})

        elif msg_type == 'get_all_elements':
            project_id = payload.get('project_id')
            if project_id:
                # 1. DB에서 전체 개수만 먼저 빠르게 가져옵니다. (메모리 사용 최소화)
                total_elements = await get_total_element_count(project_id)

                # 2. 프론트엔드에 데이터 전송 시작을 알립니다.
                await self.send(text_data=json.dumps({'type': 'revit_data_start', 'payload': {'total': total_elements}}))

                # 3. 데이터를 1000개씩 잘라서 가져오고 -> 보내는 작업을 반복합니다.
                CHUNK_SIZE = 1000
                for offset in range(0, total_elements, CHUNK_SIZE):
                    # 3-1. DB에서 데이터 '한 조각'만 가져와 직렬화합니다.
                    chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)

                    # 3-2. 직렬화된 '한 조각'을 즉시 전송합니다.
                    if chunk:
                        await self.send(text_data=json.dumps({'type': 'revit_data_chunk', 'payload': chunk}))

                    # 3-3. (매우 중요) 서버가 다른 작업을 처리할 수 있도록 잠시 제어권을 넘겨줍니다.
                    #         이 코드가 없으면 장시간 실행 시 연결이 끊길 수 있습니다.
                    await asyncio.sleep(0.01)

                # 4. 모든 데이터 전송이 완료되었음을 알립니다.
                await self.send(text_data=json.dumps({'type': 'revit_data_complete'}))
            else:
                print(f"Error: 'get_all_elements' message received without a project_id. Payload: {payload}")


        elif msg_type == 'get_tags':
            project_id = payload.get('project_id')
            if project_id:
                tags = await self.db_get_tags(project_id)
                await self.send_tags_update(tags)

        elif msg_type in ['create_tag', 'update_tag', 'delete_tag']:
            project_id = payload.get('project_id')
            if not project_id:
                print(f"Error: Tag operation '{msg_type}' without project_id.")
                return

            if msg_type == 'create_tag':
                await self.db_create_tag(project_id, payload.get('name'))
            elif msg_type == 'update_tag':
                await self.db_update_tag(payload.get('tag_id'), payload.get('new_name'))
            elif msg_type == 'delete_tag':
                await self.db_delete_tag(payload.get('tag_id'))

            # 태그 변경 후 관련된 모든 클라이언트에게 업데이트 알림
            tags = await self.db_get_tags(project_id)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})
            elements = await self.get_project_elements_from_db(project_id)
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})

        elif msg_type in ['assign_tags', 'clear_tags']:
            # ▼▼▼ [수정] 이 elif 블록 전체를 아래 코드로 교체해주세요. ▼▼▼
            project_id = payload.get('project_id') 
            element_ids = payload.get('element_ids')
            
            if msg_type == 'assign_tags':
                # 1. 먼저 DB에 태그를 할당하는 작업을 await로 호출합니다.
                await self.db_assign_tags(payload.get('tag_id'), element_ids)
            elif msg_type == 'clear_tags':
                # 1. 먼저 DB에서 태그를 제거하는 작업을 await로 호출합니다.
                await self.db_clear_tags(element_ids)

            # 2. DB 작업이 끝난 후, 변경된 데이터를 가져오는 작업을 별도로 await로 호출합니다.
            elements = await serialize_specific_elements(element_ids)

            # 변경된 element들을 모든 클라이언트에게 브로드캐스트합니다.
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})
            # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲
            
    # --- 프론트엔드로 메시지를 보내는 핸들러들 ---
    async def send_revit_data(self, event): await self.send(text_data=json.dumps({'type': 'revit_data', 'payload': event['payload']}))
    async def broadcast_progress(self, event):
        await self.send(text_data=json.dumps(event['data']))
    async def send_sync_result(self, event): await self.send(text_data=json.dumps({'type': 'sync_result', 'summary': event['summary']}))
    async def broadcast_tags(self, event): await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': event['tags']}))
    async def broadcast_elements(self, event): await self.send(text_data=json.dumps({'type': 'elements_updated', 'elements': event['elements']}))
    async def broadcast_selection(self, event): await self.send(text_data=json.dumps({'type': 'revit_selection_update', 'unique_ids': event['unique_ids']}))
    async def send_tags_update(self, tags): await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': tags}))

    async def get_project_elements_from_db(self, project_id):
        total_elements = await get_total_element_count(project_id)
        all_elements = []
        CHUNK_SIZE = 1000  # 일관된 청크 크기 사용
        for offset in range(0, total_elements, CHUNK_SIZE):
            chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)
            if chunk:
                all_elements.extend(chunk)
        return all_elements

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
        tag.name = new_name
        tag.save()
    @database_sync_to_async
    def db_delete_tag(self, tag_id):
        QuantityClassificationTag.objects.filter(id=tag_id).delete()

    @database_sync_to_async
    def db_assign_tags(self, tag_id, element_ids):
        # ▼▼▼ [수정] 이 함수는 이제 값을 반환하지 않고 DB 작업만 수행합니다. ▼▼▼
        tag = QuantityClassificationTag.objects.get(id=tag_id)
        elements_to_update = RawElement.objects.filter(id__in=element_ids)
        for element in elements_to_update:
            element.classification_tags.add(tag)
        # ▲▲▲ [수정] 여기까지가 수정된 부분입니다. ▲▲▲

    @database_sync_to_async
    def db_clear_tags(self, element_ids):
        # ▼▼▼ [수정] 이 함수는 이제 값을 반환하지 않고 DB 작업만 수행합니다. ▼▼▼
        elements_to_update = RawElement.objects.filter(id__in=element_ids)
        for element in elements_to_update:
            element.classification_tags.clear()
        # ▲▲▲ [수정] 여기까지가 수정된 부분입니다. ▲▲▲