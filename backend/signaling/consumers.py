import json
from channels.generic.websocket import AsyncWebsocketConsumer

# デバイス一覧プッシュ（views の _notify_devices_changed と同じグループ名）
PRESENCE_GROUP = 'lynkos_presence'

# ルームごとに接続中の channel_name を管理
# { room_group_name: [channel_name, ...] }
_room_members: dict[str, list] = {}


class SignalingConsumer(AsyncWebsocketConsumer):
    """
    WebRTC シグナリング Consumer。
    room_name は "deviceIdA_deviceIdB"（ソート済み）形式。
    ファイル本体は通過しない。

    [入室フロー]
    1. 新規参加者を room_members に追加
    2. 既存メンバー全員に peer-joined を通知（group_send）
    3. 新規参加者に既存メンバーを個別通知
       → これにより「後から入った側」もオファーを送れる
    """

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        if len(self.room_name) > 512 or '..' in self.room_name:
            return  # accept せず切断
        self.room_group_name = f'signal_{self.room_name}'

        # 入室前の既存メンバーを記録
        existing = list(_room_members.get(self.room_group_name, []))

        # 自分を登録
        _room_members.setdefault(self.room_group_name, []).append(self.channel_name)

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # 既存メンバーへ「新しい人が来た」を通知
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'peer_joined',
                'channel': self.channel_name,
            },
        )

        # 新規参加者へ「既存メンバー」を個別に通知
        # ※ これがないと先入りした polite 側が後から来た impolite 側に
        #   peer-joined を届けられず、オファーが送られない
        for peer_channel in existing:
            await self.send(text_data=json.dumps({
                'type': 'peer-joined',
                'peer': peer_channel,
            }))

    async def disconnect(self, close_code):
        # メンバーリストから削除
        room_list = _room_members.get(self.room_group_name, [])
        if self.channel_name in room_list:
            room_list.remove(self.channel_name)
        if not room_list:
            _room_members.pop(self.room_group_name, None)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'peer_left',
                'channel': self.channel_name,
            },
        )
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if not isinstance(data, dict):
            return

        # プロキシ／LB のアイドル切断対策（ルームにはブロードキャストしない）
        if data.get('type') == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))
            return

        data['sender'] = self.channel_name

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'signal_message',
                'message': data,
            },
        )

    async def signal_message(self, event):
        if event['message'].get('sender') == self.channel_name:
            return
        await self.send(text_data=json.dumps(event['message']))

    async def peer_joined(self, event):
        if event['channel'] == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            'type': 'peer-joined',
            'peer': event['channel'],
        }))

    async def peer_left(self, event):
        if event['channel'] == self.channel_name:
            return
        await self.send(text_data=json.dumps({
            'type': 'peer-left',
            'peer': event['channel'],
        }))


class PresenceConsumer(AsyncWebsocketConsumer):
    """
    近くのデバイス一覧の即時更新用。
    他端末が POST /api/devices/ したときに group 経由で devices-changed を受け取る。
    """

    async def connect(self):
        await self.channel_layer.group_add(PRESENCE_GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(PRESENCE_GROUP, self.channel_name)

    async def presence_ping(self, event):
        await self.send(text_data=json.dumps({'type': 'devices-changed'}))
