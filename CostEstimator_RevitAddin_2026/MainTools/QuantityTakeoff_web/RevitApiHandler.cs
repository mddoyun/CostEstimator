// RevitApiHandler.cs
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using MessageBox = System.Windows.MessageBox;
using System.Threading.Tasks; // <-- 이 using 문을 추가하면 좋습니다.

namespace RevitDjangoConnector
{
    public class RevitApiHandler : IExternalEventHandler
    {
        // 외부에서 주입받는 대신 내부에서 관리합니다.
        public JObject LastCommandData { get; set; }
        private WebSocketService _webSocketService;
        private Action<string> _updateStatusAction;
        private Action<int, int> _updateProgressAction;
        private Action<string> _resetProgressAction;
        // WebSocketService와 상태 업데이트 Action을 설정하는 메서드
        public void Setup(WebSocketService ws, Action<string> updateStatus, Action<int, int> updateProgress, Action<string> resetProgress)
        {
            _webSocketService = ws;
            _updateStatusAction = updateStatus;
            _updateProgressAction = updateProgress;
            _resetProgressAction = resetProgress;
        }

        public void Execute(UIApplication app)
        {
            try
            {
                if (LastCommandData == null || _webSocketService == null) return;

                string command = LastCommandData.Value<string>("command");
                _updateStatusAction?.Invoke($"Executing: {command}...");

                switch (command)
                {
                    case "fetch_all_elements_chunked":
                        var projectId = LastCommandData.Value<string>("project_id");
                        // UI 멈춤을 방지하기 위해 Task를 사용하여 백그라운드에서 실행
                        Task.Run(() => FetchAllElementsInChunks(app, projectId));
                        break;

                    case "get_selection":
                        var selectedIds = GetSelectedElementUniqueIds(app.ActiveUIDocument);
                        var selectionResponse = new { type = "revit_selection_response", payload = selectedIds };
                        _webSocketService.Send(Newtonsoft.Json.JsonConvert.SerializeObject(selectionResponse));
                        _updateStatusAction?.Invoke($"{selectedIds.Count} selected elements sent.");
                        break;

                    case "select_elements":
                        var uniqueIdsToSelect = LastCommandData.Value<JArray>("unique_ids").ToObject<List<string>>();
                        SelectElementsByUniqueIds(app.ActiveUIDocument, uniqueIdsToSelect);
                        _updateStatusAction?.Invoke($"{uniqueIdsToSelect.Count} elements selected in Revit.");
                        break;
                }
            }
            catch (Exception ex)
            {
                _updateStatusAction?.Invoke($"Error: {ex.Message}");
                MessageBox.Show($"An error occurred in RevitApiHandler: {ex.Message}");
            }
        }
        private async Task FetchAllElementsInChunks(UIApplication app, string projectId)
        {
            try
            {
                var doc = app.ActiveUIDocument.Document;
                var collector = new FilteredElementCollector(doc)
                    .WhereElementIsNotElementType()
                    .WhereElementIsViewIndependent();

                var allElementIds = collector.ToElementIds().ToList();
                int totalElements = allElementIds.Count;
                const int chunkSize = 100; // 한 번에 보낼 객체 수 (조정 가능)

                // 1. 총 객체 수를 웹에 먼저 알림
                var startMessage = new { type = "fetch_progress_start", payload = new { total_elements = totalElements } };
                _webSocketService.Send(JsonConvert.SerializeObject(startMessage));
                _updateStatusAction?.Invoke($"Starting to fetch {totalElements} elements...");
                _resetProgressAction?.Invoke("Fetching...");

                int processedCount = 0;
                for (int i = 0; i < totalElements; i += chunkSize)
                {
                    var chunkIds = allElementIds.Skip(i).Take(chunkSize);
                    var chunkElements = chunkIds.Select(id => doc.GetElement(id)).ToList();

                    var elementsData = RevitDataCollector.SerializeElementsToStringList(chunkElements, doc);

                    processedCount += chunkElements.Count;

                    // 2. 분할된 데이터와 현재 진행률을 전송
                    var updateMessage = new
                    {
                        type = "fetch_progress_update",
                        payload = new
                        {
                            project_id = projectId,
                            processed_count = processedCount,
                            elements = elementsData
                        }
                    };
                    _webSocketService.Send(JsonConvert.SerializeObject(updateMessage));

                    // Revit 애드인 UI 업데이트
                    _updateProgressAction?.Invoke(processedCount, totalElements);

                    await Task.Delay(50); // 시스템에 약간의 여유를 줌
                }

                // 3. 전송 완료 메시지 전송
                var completeMessage = new { type = "fetch_progress_complete", payload = new { total_sent = totalElements } };
                _webSocketService.Send(JsonConvert.SerializeObject(completeMessage));
                _updateStatusAction?.Invoke("All elements data sent successfully.");
                _resetProgressAction?.Invoke("Completed");
            }
            catch (Exception ex)
            {
                _updateStatusAction?.Invoke($"Error during fetch: {ex.Message}");
                _resetProgressAction?.Invoke("Error!");
            }
        }
        private List<string> GetSelectedElementUniqueIds(UIDocument uiDoc)
        {
            var selectedIdsList = new List<string>();
            var selection = uiDoc.Selection.GetElementIds();
            if (selection.Any())
            {
                foreach (var elementId in selection)
                {
                    var element = uiDoc.Document.GetElement(elementId);
                    if (element != null)
                    {
                        selectedIdsList.Add(element.UniqueId);
                    }
                }
            }
            return selectedIdsList;
        }

        private void SelectElementsByUniqueIds(UIDocument uiDoc, List<string> uniqueIds)
        {
            if (uniqueIds == null || !uniqueIds.Any())
            {
                uiDoc.Selection.SetElementIds(new List<ElementId>());
                return;
            }

            var elementIdsToSelect = new List<ElementId>();
            foreach (var uid in uniqueIds)
            {
                Element element = uiDoc.Document.GetElement(uid);
                if (element != null)
                {
                    elementIdsToSelect.Add(element.Id);
                }
            }

            if (elementIdsToSelect.Any())
            {
                uiDoc.Selection.SetElementIds(elementIdsToSelect);
                uiDoc.ShowElements(elementIdsToSelect);
            }
        }

        public string GetName() => "Revit Django Connector Handler";
    }
}