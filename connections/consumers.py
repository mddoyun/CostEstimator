# connections/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.db.models import F
# ▼▼▼ [추가] Count 임포트 ▼▼▼
from django.db.models import Count
# ▲▲▲ [추가] 여기까지 ▲▲▲
# ▼▼▼ [수정] AIModel 임포트 추가 ▼▼▼
from .models import Project, RawElement, QuantityClassificationTag, QuantityMember, AIModel
# ▲▲▲ [수정] 여기까지 ▲▲▲
import asyncio
# --- 데이터 직렬화 헬퍼 함수들 ---
def serialize_tags(tags):
    # 디버깅: 태그 직렬화 확인
    # print(f"[DEBUG][serialize_tags] Serializing {len(tags)} tags.") # 너무 빈번할 수 있어 주석 처리
    return [{'id': str(tag.id), 'name': tag.name} for tag in tags]

@database_sync_to_async
def get_total_element_count(project_id):
    # 디버깅: 총 객체 수 조회 시작
    print(f"[DEBUG][DB Async][get_total_element_count] Querying total elements for project: {project_id}")
    try:
        count = RawElement.objects.filter(project_id=project_id).count()
        # 디버깅: 조회 결과
        print(f"[DEBUG][DB Async][get_total_element_count] Found {count} elements.")
        return count
    except Project.DoesNotExist:
        # 디버깅: 프로젝트 없음
        print(f"[ERROR][DB Async][get_total_element_count] Project {project_id} does not exist.")
        return 0
    except Exception as e:
        # 디버깅: 기타 오류
        print(f"[ERROR][DB Async][get_total_element_count] Exception: {e}")
        return 0

@database_sync_to_async
def get_serialized_element_chunk(project_id, offset, limit):
    # 디버깅: 청크 조회 시작
    # print(f"[DEBUG][DB Async][get_serialized_element_chunk] Querying chunk for project {project_id}, offset={offset}, limit={limit}") # 너무 빈번하여 주석 처리
    try:
        element_chunk_values = list(
            RawElement.objects.filter(project_id=project_id)
            .order_by('id')
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')[offset:offset + limit]
        )
        if not element_chunk_values:
             # 디버깅: 빈 청크
             # print(f"[DEBUG][DB Async][get_serialized_element_chunk] Empty chunk returned.") # 너무 빈번하여 주석 처리
             return []
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
        # 디버깅: 청크 직렬화 완료
        # print(f"[DEBUG][DB Async][get_serialized_element_chunk] Serialized {len(element_chunk_values)} elements in chunk.") # 너무 빈번하여 주석 처리
        return element_chunk_values
    except Exception as e:
        # 디버깅: 오류 발생
        print(f"[ERROR][DB Async][get_serialized_element_chunk] Exception: {e}")
        return []

@database_sync_to_async
def serialize_specific_elements(element_ids):
    # 디버깅: 특정 객체 직렬화 시작
    print(f"[DEBUG][DB Async][serialize_specific_elements] Serializing {len(element_ids)} specific elements.")
    try:
        elements_values = list(
            RawElement.objects.filter(id__in=element_ids)
            .values('id', 'project_id', 'element_unique_id', 'updated_at', 'raw_data')
        )
        if not elements_values:
            # 디버깅: 대상 객체 없음
             print(f"[DEBUG][DB Async][serialize_specific_elements] No elements found for the given IDs.")
             return []
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
        # 디버깅: 직렬화 완료
        print(f"[DEBUG][DB Async][serialize_specific_elements] Successfully serialized {len(elements_values)} elements.")
        return elements_values
    except Exception as e:
        # 디버깅: 오류 발생
        print(f"[ERROR][DB Async][serialize_specific_elements] Exception: {e}")
        return []

class RevitConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.all_incoming_uids = set()
        self.project_id_for_fetch = None
        path = self.scope['path']
        if 'revit-connector' in path:
            self.group_name = 'revit_broadcast_group'
            print(f"✅ [{self.__class__.__name__}] Revit 클라이언트가 '{self.group_name}' 그룹에 참여합니다.") # 디버깅 추가
        elif 'blender-connector' in path:
            self.group_name = 'blender_broadcast_group'
            print(f"✅ [{self.__class__.__name__}] Blender 클라이언트가 '{self.group_name}' 그룹에 참여합니다.") # 디버깅 추가
        else:
            self.group_name = None
            print(f"⚠️ [{self.__class__.__name__}] 알 수 없는 경로로 클라이언트 연결 시도: {path}") # 디버깅 추가

        if self.group_name:
            # print(f"✅ [{self.__class__.__name__}] 클라이언트가 '{self.group_name}' 그룹에 참여합니다.") # 위에서 이미 출력
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name') and self.group_name:
            print(f"❌ [{self.__class__.__name__}] 클라이언트가 '{self.group_name}' 그룹에서 나갑니다 (Code: {close_code}).") # 디버깅 추가
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        payload = data.get('payload', {})
        print(f"\n✉️  [{self.__class__.__name__}] 클라이언트로부터 메시지 수신: type='{msg_type}'") # 기존 print 유지

        if msg_type == 'revit_selection_response':
            # 디버깅: 선택 응답 전달
            print(f"  ➡️ [{self.__class__.__name__}] 수신한 선택 정보({len(payload)}개 ID)를 프론트엔드로 전달합니다.")
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {'type': 'broadcast_selection', 'unique_ids': payload}
            )
        elif msg_type == 'fetch_progress_start':
            print("[DEBUG] 'fetch_progress_start' 수신. 동기화 세션을 시작합니다.") # 기존 print 유지
            self.all_incoming_uids.clear()

            # ▼▼▼ [수정] payload에서 project_id를 가져오는 대신, 이미 저장된 값을 확인합니다. ▼▼▼
            print(f"  - 현재 세션의 프로젝트 ID: {self.project_id_for_fetch}") # 기존 print 유지
            if not self.project_id_for_fetch:
                print("[CRITICAL ERROR] 'fetch_progress_start' 시점에 프로젝트 ID가 설정되지 않았습니다! 동기화가 실패할 수 있습니다.") # 기존 print 유지
            # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

            print(f"  - 전체 객체 수: {payload.get('total_elements')}") # 기존 print 유지
            # 디버깅: 진행 시작 브로드캐스트
            print(f"  ➡️ [{self.__class__.__name__}] 데이터 가져오기 시작 정보를 프론트엔드로 전달합니다.")
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
        elif msg_type == 'fetch_progress_update':
            print(f"[DEBUG] 'fetch_progress_update' 수신. 처리된 객체: {payload.get('processed_count')}") # 기존 print 유지

            # ▼▼▼ [수정] payload의 project_id 대신 self에 저장된 project_id를 사용합니다. ▼▼▼
            project_id = self.project_id_for_fetch
            # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

            elements_data = [json.loads(s) for s in payload.get('elements', [])]

            chunk_uids = {item['UniqueId'] for item in elements_data if item and 'UniqueId' in item}
            self.all_incoming_uids.update(chunk_uids)
            print(f"  - 이번 청크의 UniqueId {len(chunk_uids)}개 추가. 현재까지 총 {len(self.all_incoming_uids)}개 수신.") # 기존 print 유지

            # 디버깅: 진행 업데이트 브로드캐스트
            print(f"  ➡️ [{self.__class__.__name__}] 데이터 진행률 업데이트 정보를 프론트엔드로 전달합니다.")
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
            if project_id and elements_data:
                # 디버깅: DB 동기화 시작
                print(f"  🔄 [{self.__class__.__name__}] 수신한 {len(elements_data)}개 객체에 대한 DB 동기화를 시작합니다 (Project: {project_id}).")
                await asyncio.shield(self.sync_chunk_of_elements(project_id, elements_data))

        elif msg_type == 'fetch_progress_complete':
            print("[DEBUG] 'fetch_progress_complete' 수신. 동기화를 마무리하고 삭제 작업을 시작합니다.") # 기존 print 유지
            if self.project_id_for_fetch:
                # 디버깅: 삭제 작업 시작
                print(f"  🗑️ [{self.__class__.__name__}] 오래된 객체 삭제 작업을 시작합니다 (Project: {self.project_id_for_fetch}).")
                await cleanup_old_elements(self.project_id_for_fetch, self.all_incoming_uids)
            else:
                print("[WARNING] 'project_id_for_fetch'가 설정되지 않아 삭제 작업을 건너뜁니다.") # 기존 print 유지

            # 디버깅: 완료 브로드캐스트
            print(f"  ➡️ [{self.__class__.__name__}] 데이터 가져오기 완료 정보를 프론트엔드로 전달합니다.")
            await self.channel_layer.group_send(
                FrontendConsumer.frontend_group_name,
                {"type": "broadcast_progress", "data": data}
            )
        else:
            print(f"[WARNING] 처리되지 않은 메시지 유형입니다: {msg_type}") # 기존 print 유지

    async def send_command(self, event):
        command_data = event['command_data']

        # ▼▼▼ [추가] 데이터 가져오기 명령일 경우, project_id를 미리 저장합니다. ▼▼▼
        if command_data.get('command') == 'fetch_all_elements_chunked':
            project_id = command_data.get('project_id')
            self.project_id_for_fetch = project_id
            print(f"🚀 [{self.__class__.__name__}] 데이터 가져오기 세션 시작. Project ID '{project_id}'를 저장합니다.") # 기존 print 유지
        # ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

        print(f"➡️  [{self.__class__.__name__}] '{self.group_name}' 그룹의 클라이언트로 명령을 보냅니다: {command_data.get('command')}") # 기존 print 유지
        try: # 디버깅: send 실패 시 로그 추가
            await self.send(text_data=json.dumps(command_data))
        except Exception as e:
            print(f"[ERROR][{self.__class__.__name__}] Failed to send command to client: {e}")


    @database_sync_to_async
    def sync_chunk_of_elements(self, project_id, parsed_data):
        print(f"  [DB Sync] 청크 동기화 시작: {len(parsed_data)}개 객체") # 기존 print 유지
        try:
            project = Project.objects.get(id=project_id)
            uids_in_chunk = [item['UniqueId'] for item in parsed_data if item and 'UniqueId' in item]
            existing_elements_map = {el.element_unique_id: el for el in project.raw_elements.filter(element_unique_id__in=uids_in_chunk)}
            print(f"    - DB에서 기존 객체 {len(existing_elements_map)}개 찾음.") # 디버깅 추가

            to_update, to_create = [], []
            for item in parsed_data:
                if not item or 'UniqueId' not in item: continue
                uid = item['UniqueId']
                if uid in existing_elements_map:
                    elem = existing_elements_map[uid]
                    # [개선] raw_data가 실제로 변경되었는지 확인 후 업데이트 목록에 추가 (선택 사항)
                    if elem.raw_data != item:
                        elem.raw_data = item
                        to_update.append(elem)
                else:
                    to_create.append(RawElement(project=project, element_unique_id=uid, raw_data=item))

            if to_update:
                updated_ids = [el.id for el in to_update] # 디버깅용
                RawElement.objects.bulk_update(to_update, ['raw_data'])
                print(f"    - {len(to_update)}개 객체 정보 업데이트 완료. (IDs: {updated_ids[:5]}...)") # 기존 print 유지 (ID 추가)
            if to_create:
                created_objs = RawElement.objects.bulk_create(to_create, ignore_conflicts=True)
                print(f"    - {len(created_objs)}개 객체 새로 생성 완료.") # 기존 print 유지 (실제 생성된 수 사용)

        except Exception as e:
            print(f"[ERROR] sync_chunk_of_elements DB 작업 중 오류 발생: {e}") # 기존 print 유지

@database_sync_to_async
def cleanup_old_elements(project_id, incoming_uids):
    print(f"  [DB Cleanup] 삭제 작업 시작 (Project ID: {project_id})") # 기존 print 유지
    try:
        project = Project.objects.get(id=project_id)

        # [개선] QuerySet 사용 최적화 (values_list 대신 set 직접 사용)
        db_uids = set(project.raw_elements.values_list('element_unique_id', flat=True))
        print(f"    - 현재 DB에 존재하는 UniqueId 수: {len(db_uids)}") # 기존 print 유지

        incoming_uids_set = set(incoming_uids)
        print(f"    - 이번 동기화에서 받은 UniqueId 수: {len(incoming_uids_set)}") # 기존 print 유지

        to_delete_uids = db_uids - incoming_uids_set
        print(f"    - 삭제 대상 UniqueId 수: {len(to_delete_uids)}") # 기존 print 유지

        if to_delete_uids:
            print(f"    - 삭제 대상 ID (최대 10개 표시): {list(to_delete_uids)[:10]}") # 기존 print 유지

            # ▼▼▼ [추가] RawElement를 삭제하기 전에, 연관된 QuantityMember를 먼저 삭제하는 로직입니다. ▼▼▼
            print(f"    - [QuantityMember Cleanup] 삭제될 RawElement와 연관된 수량산출부재를 먼저 삭제합니다.") # 기존 print 유지

            # raw_element 필드가 null이 아닌(즉, BIM 객체와 연계된) 수량산출부재 중에서
            # 삭제될 RawElement의 unique_id를 가진 부재들을 찾아 삭제합니다.
            deletable_members = QuantityMember.objects.filter(
                project=project,
                raw_element__element_unique_id__in=to_delete_uids
            )

            member_deleted_count, deleted_details = deletable_members.delete() # 상세 정보 받을 수 있음
            print(f"    - [QuantityMember Cleanup] {member_deleted_count}개의 연관된 수량산출부재를 삭제했습니다. Details: {deleted_details}") # 기존 print 유지 (상세 정보 추가)
            # ▲▲▲ [추가] 여기까지 입니다. ▲▲▲

            deleted_count, deleted_raw_details = project.raw_elements.filter(element_unique_id__in=to_delete_uids).delete()
            print(f"    - DB에서 {deleted_count}개의 오래된 RawElement 객체를 성공적으로 삭제했습니다. Details: {deleted_raw_details}") # 기존 print 유지 (상세 정보 추가)
        else:
            print("    - 삭제할 객체가 없습니다. 모든 데이터가 최신 상태입니다.") # 기존 print 유지

    except Exception as e:
        print(f"[ERROR] cleanup_old_elements DB 작업 중 오류 발생: {e}") # 기존 print 유지

class FrontendConsumer(AsyncWebsocketConsumer):
    frontend_group_name = 'frontend_group'
    async def connect(self):
        # 디버깅: 프론트엔드 연결
        print(f"✅ [{self.__class__.__name__}] 웹 브라우저 클라이언트가 '{self.frontend_group_name}' 그룹에 참여합니다.")
        await self.channel_layer.group_add(self.frontend_group_name, self.channel_name); await self.accept()
    async def disconnect(self, close_code):
        # 디버깅: 프론트엔드 연결 해제
        print(f"❌ [{self.__class__.__name__}] 웹 브라우저 클라이언트가 '{self.frontend_group_name}' 그룹에서 나갑니다 (Code: {close_code}).")
        await self.channel_layer.group_discard(self.frontend_group_name, self.channel_name)


    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        payload = data.get('payload', {})
        print(f"✉️ [{self.__class__.__name__}] 웹 브라우저로부터 메시지 수신: type='{msg_type}'") # 기존 print 유지

        if msg_type == 'command_to_client':
            target_group = payload.pop('target_group', 'revit_broadcast_group')
            print(f"   ➡️  '{target_group}' 그룹으로 명령을 전달합니다: {payload}") # 기존 print 유지
            await self.channel_layer.group_send(target_group, {'type': 'send.command', 'command_data': payload})

        # ▼▼▼ [수정] get_all_elements 메시지 처리 부분에 print문 추가 ▼▼▼
        elif msg_type == 'get_all_elements':
            project_id = payload.get('project_id')
            if project_id:
                print(f"\n[DEBUG] 프론트엔드로부터 '{project_id}' 프로젝트의 모든 객체 데이터 요청을 받았습니다.") # 기존 print 유지
                total_elements = await get_total_element_count(project_id)
                print(f"[DEBUG] 총 {total_elements}개의 객체를 전송 시작합니다.") # 기존 print 유지
                await self.send(text_data=json.dumps({'type': 'revit_data_start', 'payload': {'total': total_elements}}))

                CHUNK_SIZE = 1000 # 성능 테스트 후 조절 가능
                sent_count = 0
                for offset in range(0, total_elements, CHUNK_SIZE):
                    chunk = await get_serialized_element_chunk(project_id, offset, CHUNK_SIZE)
                    if chunk:
                        await self.send(text_data=json.dumps({'type': 'revit_data_chunk', 'payload': chunk}))
                        sent_count += len(chunk)
                        # 디버깅: 청크 전송 로그 (너무 빈번할 수 있으므로 주석 처리 또는 조건부 출력 고려)
                        # print(f"    [WebSocket Send] Sent chunk: {offset+1}-{sent_count}/{total_elements}")
                    await asyncio.sleep(0.01) # 부하 분산을 위한 약간의 지연

                print(f"[DEBUG] {sent_count}개 객체 전송을 완료했습니다 (총 {total_elements}개 대상).") # 기존 print 유지 (실제 전송된 수 포함)
                await self.send(text_data=json.dumps({'type': 'revit_data_complete'}))
        # ▲▲▲ [수정] 여기까지 입니다. ▲▲▲

        elif msg_type == 'get_tags':
            project_id = payload.get('project_id')
            if project_id:
                # 디버깅: 태그 요청
                print(f"[DEBUG] '{project_id}' 프로젝트의 태그 목록 요청 수신.")
                tags = await self.db_get_tags(project_id)
                await self.send_tags_update(tags)
        
        elif msg_type in ['create_tag', 'update_tag']:
            project_id = payload.get('project_id')
            if not project_id: return
            if msg_type == 'create_tag':
                # 디버깅: 태그 생성 요청
                print(f"[DEBUG] 태그 생성 요청: name='{payload.get('name')}'")
                await self.db_create_tag(project_id, payload.get('name'))
            elif msg_type == 'update_tag':
                # 디버깅: 태그 수정 요청
                print(f"[DEBUG] 태그 수정 요청: id='{payload.get('tag_id')}', new_name='{payload.get('new_name')}'")
                await self.db_update_tag(payload.get('tag_id'), payload.get('new_name'))

            # 생성 또는 수정 후에는 태그 목록만 업데이트하여 브로드캐스트합니다.
            tags = await self.db_get_tags(project_id)
            # 디버깅: 태그 목록 브로드캐스트
            print(f"  ➡️ [{self.__class__.__name__}] 업데이트된 태그 목록을 모든 클라이언트로 브로드캐스트합니다.")
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})

        elif msg_type == 'delete_tag':
            project_id = payload.get('project_id')
            tag_id = payload.get('tag_id')
            if not all([project_id, tag_id]): return
            # 디버깅: 태그 삭제 요청
            print(f"[DEBUG] 태그 삭제 요청: id='{tag_id}'")

            # 1. 태그를 삭제하고, 영향을 받았던 element들의 ID 목록을 가져옵니다.
            affected_ids = await self.db_delete_tag(tag_id)
            # 디버깅: 삭제 결과 및 영향 받은 객체 ID
            print(f"  - 태그 삭제 완료. 영향 받은 객체 수: {len(affected_ids)}")

            # 2. 변경된 전체 태그 목록을 모든 클라이언트에 브로드캐스트합니다.
            tags = await self.db_get_tags(project_id)
            print(f"  ➡️ [{self.__class__.__name__}] 업데이트된 태그 목록을 브로드캐스트합니다.")
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_tags', 'tags': tags})

            # 3. 만약 영향을 받은 element가 있었다면, 해당 element들의 최신 정보를 브로드캐스트합니다.
            if affected_ids:
                elements = await serialize_specific_elements(affected_ids)
                print(f"  ➡️ [{self.__class__.__name__}] 영향 받은 {len(elements)}개 객체의 업데이트 정보를 브로드캐스트합니다.")
                await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})
        elif msg_type in ['assign_tags', 'clear_tags']:
            element_ids = payload.get('element_ids')
            if msg_type == 'assign_tags':
                # 디버깅: 태그 할당 요청
                print(f"[DEBUG] 태그 할당 요청: tag_id='{payload.get('tag_id')}', elements={len(element_ids)}개")
                await self.db_assign_tags(payload.get('tag_id'), element_ids)
            elif msg_type == 'clear_tags':
                # 디버깅: 태그 제거 요청
                print(f"[DEBUG] 태그 제거 요청: elements={len(element_ids)}개")
                await self.db_clear_tags(element_ids)
            elements = await serialize_specific_elements(element_ids)
            # 디버깅: 객체 업데이트 브로드캐스트
            print(f"  ➡️ [{self.__class__.__name__}] 업데이트된 {len(elements)}개 객체 정보를 브로드캐스트합니다.")
            await self.channel_layer.group_send(self.frontend_group_name, {'type': 'broadcast_elements', 'elements': elements})
        # ▼▼▼ [추가] AI 학습 상태 폴링 요청 처리 ▼▼▼
        elif msg_type == 'get_training_status':
             task_id = payload.get('task_id')
             if task_id and task_id in training_progress:
                 print(f"[DEBUG] AI 학습 상태 요청 수신 (Task ID: {task_id}). 현재 상태 전송.")
                 await self.send(text_data=json.dumps({
                     'type': 'training_progress_update',
                     'project_id': payload.get('project_id'), # 원본 요청의 project_id 전달
                     'task_id': task_id,
                     'progress': training_progress[task_id]
                 }))
             else:
                 print(f"[WARN] 유효하지 않거나 완료된 Task ID({task_id})에 대한 상태 요청 수신.")
        # ▲▲▲ [추가] 여기까지 ▲▲▲
        else:
            # 디버깅: 알 수 없는 메시지 타입
            print(f"[WARNING][{self.__class__.__name__}] 처리되지 않은 메시지 유형: {msg_type}")


    async def broadcast_progress(self, event):
        # 디버깅: 진행률 브로드캐스트
        print(f"  ➡️ [{self.__class__.__name__}] 데이터 가져오기 진행률 브로드캐스트: type='{event['data'].get('type')}'")
        await self.send(text_data=json.dumps(event['data']))
    async def broadcast_tags(self, event):
        # 디버깅: 태그 목록 브로드캐스트
        print(f"  ➡️ [{self.__class__.__name__}] 태그 목록 업데이트 브로드캐스트 ({len(event['tags'])}개).")
        await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': event['tags']}))
    async def broadcast_elements(self, event):
        # 디버깅: 객체 정보 브로드캐스트
        print(f"  ➡️ [{self.__class__.__name__}] 객체 정보 업데이트 브로드캐스트 ({len(event['elements'])}개).")
        await self.send(text_data=json.dumps({'type': 'elements_updated', 'elements': event['elements']}))
    async def broadcast_selection(self, event):
        # 디버깅: 선택 정보 브로드캐스트
        print(f"  ➡️ [{self.__class__.__name__}] Revit/Blender 선택 정보 업데이트 브로드캐스트 ({len(event['unique_ids'])}개).")
        await self.send(text_data=json.dumps({'type': 'revit_selection_update', 'unique_ids': event['unique_ids']}))

    # ▼▼▼ [추가] AI 학습 진행률 브로드캐스트 핸들러 ▼▼▼
    async def broadcast_training_progress(self, event):
        """views.py에서 호출되어 AI 학습 진행률을 특정 클라이언트 그룹에게 전송"""
        print(f"  ➡️ [{self.__class__.__name__}] AI 학습 진행률 브로드캐스트 (Task ID: {event['task_id']}, Status: {event['progress']['status']}).")
        await self.send(text_data=json.dumps({
            'type': 'training_progress_update', # 프론트엔드에서 받을 메시지 타입
            'project_id': event['project_id'],
            'task_id': event['task_id'],
            'progress': event['progress'],
        }))
    # ▲▲▲ [추가] 여기까지 ▲▲▲

    async def send_tags_update(self, tags):
        # 디버깅: 특정 클라이언트에게 태그 목록 전송
        print(f"  ➡️ [{self.__class__.__name__}] 현재 클라이언트에게 태그 목록 전송 ({len(tags)}개).")
        await self.send(text_data=json.dumps({'type': 'tags_updated', 'tags': tags}))

    @database_sync_to_async
    def db_get_tags(self, project_id):
        # 디버깅: DB에서 태그 조회
        print(f"[DEBUG][DB Async][db_get_tags] Querying tags for project: {project_id}")
        project = Project.objects.get(id=project_id)
        tags = list(project.classification_tags.all())
        print(f"[DEBUG][DB Async][db_get_tags] Found {len(tags)} tags.")
        return serialize_tags(tags)
    @database_sync_to_async
    def db_create_tag(self, project_id, name):
        if not name: return
        # 디버깅: DB에 태그 생성
        print(f"[DEBUG][DB Async][db_create_tag] Creating tag '{name}' for project: {project_id}")
        project = Project.objects.get(id=project_id)
        tag, created = QuantityClassificationTag.objects.get_or_create(project=project, name=name)
        print(f"[DEBUG][DB Async][db_create_tag] Tag '{name}' {'created' if created else 'already exists'}.")
    @database_sync_to_async
    def db_update_tag(self, tag_id, new_name):
        if not new_name: return
        # 디버깅: DB에서 태그 수정
        print(f"[DEBUG][DB Async][db_update_tag] Updating tag ID '{tag_id}' to name '{new_name}'")
        try:
            tag = QuantityClassificationTag.objects.get(id=tag_id)
            tag.name = new_name; tag.save()
            print(f"[DEBUG][DB Async][db_update_tag] Tag ID '{tag_id}' updated successfully.")
        except QuantityClassificationTag.DoesNotExist:
            print(f"[ERROR][DB Async][db_update_tag] Tag ID '{tag_id}' not found.")
    @database_sync_to_async
    def db_delete_tag(self, tag_id):
        """
        태그를 삭제하고, 해당 태그에 영향을 받았던 RawElement의 ID 목록을 반환합니다.
        """
        # 디버깅: DB에서 태그 삭제
        print(f"[DEBUG][DB Async][db_delete_tag] Deleting tag ID '{tag_id}'")
        try:
            # 삭제하기 전에, 어떤 객체들이 이 태그를 가지고 있었는지 ID를 가져옵니다.
            tag_to_delete = QuantityClassificationTag.objects.prefetch_related('raw_elements').get(id=tag_id)
            affected_element_ids = list(tag_to_delete.raw_elements.values_list('id', flat=True))
            print(f"[DEBUG][DB Async][db_delete_tag] Found {len(affected_element_ids)} affected elements before deletion.")

            # 태그를 삭제합니다. (ManyToManyField 관계는 자동으로 정리됩니다)
            tag_to_delete.delete()
            print(f"[DEBUG][DB Async][db_delete_tag] Tag ID '{tag_id}' deleted successfully.")

            return affected_element_ids
        except QuantityClassificationTag.DoesNotExist:
            print(f"[ERROR][DB Async][db_delete_tag] Tag ID '{tag_id}' not found.")
            return [] # 삭제할 태그가 없으면 빈 목록을 반환합니다.
        except Exception as e:
            print(f"[ERROR][DB Async][db_delete_tag] Exception during deletion: {e}")
            return []
    @database_sync_to_async
    def db_assign_tags(self, tag_id, element_ids):
        # 디버깅: DB에서 태그 할당
        print(f"[DEBUG][DB Async][db_assign_tags] Assigning tag ID '{tag_id}' to {len(element_ids)} elements.")
        try:
            tag = QuantityClassificationTag.objects.get(id=tag_id)
            elements_to_update = RawElement.objects.filter(id__in=element_ids)
            added_count = 0
            for element in elements_to_update:
                _, created = element.classification_tags.through.objects.get_or_create(rawelement=element, quantityclassificationtag=tag)
                if created: added_count += 1
            print(f"[DEBUG][DB Async][db_assign_tags] Tag assignment complete. {added_count} new assignments.")
        except QuantityClassificationTag.DoesNotExist:
            print(f"[ERROR][DB Async][db_assign_tags] Tag ID '{tag_id}' not found.")
        except Exception as e:
            print(f"[ERROR][DB Async][db_assign_tags] Exception during assignment: {e}")
    @database_sync_to_async
    def db_clear_tags(self, element_ids):
        # 디버깅: DB에서 태그 제거
        print(f"[DEBUG][DB Async][db_clear_tags] Clearing tags from {len(element_ids)} elements.")
        try:
            elements_to_update = RawElement.objects.filter(id__in=element_ids)
            cleared_count = 0
            for element in elements_to_update:
                if element.classification_tags.exists():
                    element.classification_tags.clear()
                    cleared_count += 1
            print(f"[DEBUG][DB Async][db_clear_tags] Tag clearing complete. {cleared_count} elements had tags cleared.")
        except Exception as e:
            print(f"[ERROR][DB Async][db_clear_tags] Exception during clearing: {e}")