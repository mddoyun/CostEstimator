// ConnectorWindow.xaml.cs (직접 실행 방식으로 수정)
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using MessageBox = System.Windows.MessageBox;

namespace RevitDjangoConnector
{
    public partial class ConnectorWindow : Window
    {
        private readonly ExternalEvent _externalEvent;
        private readonly RevitApiHandler _apiHandler;
        private WebSocketService _webSocketService;
        private Process _serverProcess; // Django 서버 프로세스를 관리하기 위한 변수

        public ConnectorWindow(ExternalEvent externalEvent, RevitApiHandler apiHandler)
        {
            InitializeComponent();
            _externalEvent = externalEvent;
            _apiHandler = apiHandler;
        }

        // [핵심 수정] 서버 시작 버튼 클릭 이벤트
        private void StartServerButton_Click(object sender, RoutedEventArgs e)
        {
            if (_serverProcess != null && !_serverProcess.HasExited)
            {
                UpdateStatus("Server is already running.");
                // 이미 실행 중인 창이 있으면 활성화 시도 (선택적)
                // IntPtr handle = _serverProcess.MainWindowHandle;
                // if (handle != IntPtr.Zero) { /* Window activation logic */ }
                return;
            }

            string assemblyLocation = Assembly.GetExecutingAssembly().Location;
            string addonDirectory = Path.GetDirectoryName(assemblyLocation);
            string serverExecutablePath = Path.GetFullPath(Path.Combine(addonDirectory, "..", "..", "server", "CostEstimatorServer.exe"));

            if (!File.Exists(serverExecutablePath))
            {
                UpdateStatus($"ERROR: Server executable not found at '{serverExecutablePath}'");
                MessageBox.Show($"Server executable not found. Please make sure 'CostEstimatorServer.exe' is in the correct location.\n\nSearched Path:\n{serverExecutablePath}", "File Not Found", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            try
            {
                // --- ▼▼▼ [이 부분이 핵심 수정 내용입니다] ▼▼▼ ---

                // ProcessStartInfo를 사용하여 셸 실행(더블클릭과 동일)을 활성화합니다.
                ProcessStartInfo startInfo = new ProcessStartInfo(serverExecutablePath)
                {
                    // UseShellExecute = true로 설정하면, 윈도우가 파일을 직접 실행하는 것처럼 동작합니다.
                    // .exe 파일이므로 새 콘솔 창이 뜨게 됩니다.
                    UseShellExecute = true,

                    // 아래 속성들은 UseShellExecute = true와 함께 사용할 수 없으므로 제거/주석처리합니다.
                    // CreateNoWindow = false,
                    // RedirectStandardOutput = false,
                    // RedirectStandardError = false
                };

                _serverProcess = Process.Start(startInfo);

                // --- ▲▲▲ [핵심 수정 완료] ▲▲▲ ---


                if (_serverProcess == null || _serverProcess.HasExited)
                {
                    throw new Exception("Process could not be started.");
                }

                UpdateStatus("Server process launched in a new window.");
                StartServerButton.IsEnabled = false;
            }
            catch (Exception ex)
            {
                UpdateStatus($"Failed to start server: {ex.Message}");
                MessageBox.Show($"Could not start the server process: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void ConnectButton_Click(object sender, RoutedEventArgs e)
        {
            if (_serverProcess == null || _serverProcess.HasExited)
            {
                MessageBox.Show("Please start the server first.", "Server Not Running", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var serverUrl = ServerUrlTextBox.Text;
            if (string.IsNullOrWhiteSpace(serverUrl))
            {
                MessageBox.Show("Please enter a server URL.");
                return;
            }

            _webSocketService = new WebSocketService(serverUrl);
            _webSocketService.OnMessageReceived += HandleServerMessage;
            _apiHandler.Setup(_webSocketService, UpdateStatus, UpdateProgress, ResetProgress);

            try
            {
                UpdateStatus("Connecting to WebSocket server...");
                await _webSocketService.ConnectAsync();
                if (_webSocketService.IsConnected)
                {
                    UpdateStatus("Connected to server. Opening browser...");
                    ConnectButton.IsEnabled = false;
                    DisconnectButton.IsEnabled = true;

                    try
                    {
                        string httpUrl = serverUrl.Replace("ws://", "http://").Split(new[] { "/ws/" }, StringSplitOptions.None)[0];
                        var psi = new ProcessStartInfo { FileName = httpUrl, UseShellExecute = true };
                        Process.Start(psi);
                    }
                    catch (Exception ex)
                    {
                        UpdateStatus($"Could not open browser: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                UpdateStatus($"Failed to connect: {ex.Message}");
            }
        }

        private async void DisconnectButton_Click(object sender, RoutedEventArgs e)
        {
            if (_webSocketService != null)
            {
                await _webSocketService.DisconnectAsync();
                _webSocketService = null;
            }
            UpdateStatus("Disconnected from WebSocket.");

            StopServerProcess();

            ConnectButton.IsEnabled = true;
            DisconnectButton.IsEnabled = false;
            StartServerButton.IsEnabled = true;
            ResetProgress();
        }

        private void StopServerProcess()
        {
            if (_serverProcess != null && !_serverProcess.HasExited)
            {
                try
                {
                    UpdateStatus("Stopping server process...");
                    // .Kill()은 프로세스를 강제 종료합니다.
                    _serverProcess.Kill();
                    _serverProcess.WaitForExit(5000);
                    UpdateStatus("Server process stopped.");
                }
                catch (Exception ex)
                {
                    UpdateStatus($"Error stopping server process: {ex.Message}");
                }
                finally
                {
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }
            }
        }

        private async void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (_webSocketService != null && _webSocketService.IsConnected)
            {
                await _webSocketService.DisconnectAsync();
            }
            StopServerProcess();
        }

        // --- 나머지 메서드는 변경 없음 ---
        public void UpdateProgress(int current, int total)
        {
            Dispatcher.Invoke(() => { if (total > 0 && current >= 0) { ProgressBar.Maximum = total; ProgressBar.Value = current; ProgressTextBlock.Text = $"{current} / {total} ({((double)current / total * 100):F0}%)"; } });
        }

        public void ResetProgress(string initialMessage = "Ready")
        {
            Dispatcher.Invoke(() => { ProgressBar.Value = 0; ProgressTextBlock.Text = initialMessage; });
        }

        private void HandleServerMessage(string message)
        {
            Dispatcher.Invoke(() => { try { var jsonMessage = JObject.Parse(message); if (jsonMessage.Value<string>("command") == "disconnected_by_server") { UpdateStatus("Disconnected by server. Please reconnect."); ConnectButton.IsEnabled = true; DisconnectButton.IsEnabled = false; return; } UpdateStatus($"Command received: {jsonMessage.Value<string>("command")}"); _apiHandler.LastCommandData = jsonMessage; _externalEvent.Raise(); } catch (Exception ex) { UpdateStatus($"Error processing message: {ex.Message}"); } });
        }

        private void UpdateStatus(string message)
        {
            Dispatcher.Invoke(() => { if (StatusTextBox.LineCount > 200) { StatusTextBox.Text = StatusTextBox.Text.Substring(StatusTextBox.Text.IndexOf('\n', 50) + 1); } StatusTextBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n"); StatusTextBox.ScrollToEnd(); });
        }
    }
}