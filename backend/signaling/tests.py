from unittest import mock

from django.test import RequestFactory, TestCase

from signaling import presence_state
from signaling.network import client_ip_from_request
from signaling.views import DeviceListView


class PresenceNetworkScopeTests(TestCase):
    def setUp(self):
        presence_state._online_devices.clear()

    def tearDown(self):
        presence_state._online_devices.clear()

    def test_devices_filtered_by_public_ip(self):
        presence_state.register_from_http(
            'home-ios',
            'Home iPad',
            'mobile',
            'ios',
            None,
            client_ip='203.0.113.10',
        )
        presence_state.register_from_http(
            'away-web',
            'Away PC',
            'desktop',
            'windows',
            None,
            client_ip='198.51.100.20',
        )

        home = presence_state.active_devices_public(for_client_ip='203.0.113.10')
        away = presence_state.active_devices_public(for_client_ip='198.51.100.20')

        self.assertEqual([d['deviceId'] for d in home], ['home-ios'])
        self.assertEqual([d['deviceId'] for d in away], ['away-web'])

    def test_api_get_uses_request_ip(self):
        presence_state.register_from_http(
            'home-ios',
            'Home iPad',
            'mobile',
            'ios',
            None,
            client_ip='203.0.113.10',
        )
        presence_state.register_from_http(
            'away-web',
            'Away PC',
            'desktop',
            'windows',
            None,
            client_ip='198.51.100.20',
        )

        factory = RequestFactory()
        request = factory.get(
            '/api/devices/',
            HTTP_X_FORWARDED_FOR='203.0.113.10, 10.0.0.1',
        )
        response = DeviceListView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['deviceId'], 'home-ios')

    def test_client_ip_from_request_prefers_forwarded_header(self):
        factory = RequestFactory()
        request = factory.get(
            '/api/devices/',
            HTTP_X_FORWARDED_FOR='203.0.113.55, 10.0.0.2',
        )
        self.assertEqual(client_ip_from_request(request), '203.0.113.55')

    def test_presence_group_name_is_scoped(self):
        self.assertEqual(
            presence_state.presence_group_for('203.0.113.10'),
            'lynkos_presence_203.0.113.10',
        )


class PresenceNotificationTests(TestCase):
    """一覧の見え方が変わったときだけ devices-changed を通知する（通知→再登録の無限ループ防止）。"""

    def setUp(self):
        presence_state._online_devices.clear()
        patcher = mock.patch.object(presence_state, '_notify_devices_changed')
        self.notify = patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(presence_state._online_devices.clear)

    def register(self, name='iPhone', client_ip='203.0.113.10', device_id='ios-1'):
        presence_state.register_from_http(device_id, name, 'mobile', 'ios', None, client_ip=client_ip)

    def test_new_device_notifies(self):
        self.register()
        self.notify.assert_called_once_with('203.0.113.10')

    def test_unchanged_heartbeat_does_not_notify(self):
        self.register()
        self.notify.reset_mock()
        for _ in range(5):
            self.register()
        self.notify.assert_not_called()

    def test_name_change_notifies(self):
        self.register()
        self.notify.reset_mock()
        self.register(name='My iPhone')
        self.notify.assert_called_once_with('203.0.113.10')

    def test_network_change_notifies_old_and_new_group(self):
        self.register()
        self.notify.reset_mock()
        self.register(client_ip='198.51.100.20')
        self.assertEqual(
            [c.args[0] for c in self.notify.call_args_list],
            ['203.0.113.10', '198.51.100.20'],
        )

    def test_expired_device_is_removed_and_notified(self):
        self.register()
        self.notify.reset_mock()
        presence_state._online_devices['ios-1']['_ts'] -= presence_state.DEVICE_TTL + 1
        self.assertEqual(presence_state.active_devices_public('203.0.113.10'), [])
        self.notify.assert_called_once_with('203.0.113.10')

    def test_reregister_after_expiry_notifies_as_new(self):
        self.register()
        presence_state._online_devices['ios-1']['_ts'] -= presence_state.DEVICE_TTL + 1
        self.notify.reset_mock()
        self.register()
        # TTL 切れの削除通知と、新規登録の通知
        self.assertEqual(self.notify.call_count, 2)

    def test_remove_unknown_device_does_not_notify(self):
        presence_state.remove_device('missing')
        self.notify.assert_not_called()

    def test_remove_known_device_notifies(self):
        self.register()
        self.notify.reset_mock()
        presence_state.remove_device('ios-1')
        self.notify.assert_called_once_with('203.0.113.10')

    def test_ws_device_info_unchanged_is_not_rebroadcast(self):
        dev = {'deviceId': 'ios-1', 'name': 'iPhone', 'type': 'mobile', 'platform': 'ios'}
        self.assertIsNotNone(presence_state.merge_from_ws_device_payload(dev, '203.0.113.10'))
        self.assertIsNone(presence_state.merge_from_ws_device_payload(dev, '203.0.113.10'))

    def test_http_then_ws_with_same_content_does_not_notify_twice(self):
        self.register()
        self.notify.reset_mock()
        dev = {'deviceId': 'ios-1', 'name': 'iPhone', 'type': 'mobile', 'platform': 'ios'}
        self.assertIsNone(presence_state.merge_from_ws_device_payload(dev, '203.0.113.10'))
        self.notify.assert_not_called()
