// WebSocketService.cs
using System;
using System.Net.WebSockets;
using System.Threading.Tasks;
using Websocket.Client;

namespace RevitDjangoConnector
{
    public class WebSocketService : IDisposable
    {
        private WebsocketClient _client;
        private readonly Uri _serverUri;

        public event Action<string> OnMessageReceived;
        public bool IsConnected => _client?.IsRunning ?? false;

        public WebSocketService(string serverUrl)
        {
            _serverUri = new Uri(serverUrl);
        }

        public async Task ConnectAsync()
        {
            if (IsConnected) return;

            var factory = new Func<ClientWebSocket>(() => new ClientWebSocket
            {
                Options = { KeepAliveInterval = TimeSpan.FromSeconds(5) }
            });

            _client = new WebsocketClient(_serverUri, factory)
            {
                ReconnectTimeout = null
            };
            _client.IsReconnectionEnabled = false;

            _client.MessageReceived.Subscribe(msg => OnMessageReceived?.Invoke(msg.Text));

            _client.DisconnectionHappened.Subscribe(info =>
            {
                OnMessageReceived?.Invoke("{\"command\":\"disconnected_by_server\"}");
            });

            await _client.Start();
        }

        public async Task DisconnectAsync()
        {
            if (_client != null)
            {
                await _client.Stop(WebSocketCloseStatus.NormalClosure, "Client disconnecting.");
            }
        }

        public void Send(string message)
        {
            if (IsConnected)
            {
                _client.Send(message);
            }
        }

        public void Dispose()
        {
            _client?.Dispose();
        }
    }
}