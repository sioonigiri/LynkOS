from django.urls import path
from . import views

urlpatterns = [
    path('devices/',        views.DeviceListView.as_view(),   name='device-list'),
    path('devices/delete/', views.DeviceDeleteView.as_view(), name='device-delete'),
    path('health/',         views.health_check,               name='health-check'),
]
