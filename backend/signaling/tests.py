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
