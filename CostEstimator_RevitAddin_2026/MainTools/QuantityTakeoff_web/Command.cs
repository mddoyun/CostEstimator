// Command.cs
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using RevitDjangoConnector;
using System;
using System.Windows.Interop;

// 네임스페이스는 당신의 프로젝트에 맞게 수정하세요.
namespace AiBimCost.MainTools.QuantityTakeoff_web
{
    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    [Autodesk.Revit.Attributes.Regeneration(Autodesk.Revit.Attributes.RegenerationOption.Manual)]
    public class Command : IExternalCommand
    {
        private static ConnectorWindow _connectorWindow;
        private static RevitApiHandler _handler;
        private static ExternalEvent _externalEvent;

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                if (_connectorWindow != null && _connectorWindow.IsVisible)
                {
                    _connectorWindow.Activate();
                    return Result.Succeeded;
                }

                if (_handler == null)
                {
                    // RevitApiHandler 생성자를 비워둡니다.
                    _handler = new RevitApiHandler();
                }
                if (_externalEvent == null)
                {
                    _externalEvent = ExternalEvent.Create(_handler);
                }

                // 핸들러와 이벤트를 ConnectorWindow에 전달합니다.
                _connectorWindow = new ConnectorWindow(_externalEvent, _handler);

                var revitWindowHandle = commandData.Application.MainWindowHandle;
                var windowInteropHelper = new WindowInteropHelper(_connectorWindow);
                windowInteropHelper.Owner = revitWindowHandle;

                _connectorWindow.Show();
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }

            return Result.Succeeded;
        }
    }
}