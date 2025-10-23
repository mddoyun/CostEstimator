using Autodesk.Revit.UI;
using System.IO;
using System.Windows.Media.Imaging;

namespace AiBimCost.StartTools
{
    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    [Autodesk.Revit.Attributes.Regeneration(Autodesk.Revit.Attributes.RegenerationOption.Manual)]
    class CreateRibbon :IExternalApplication
    {
        #region DLL 경로 지정 - 빌드시 빌드경로로 수정해야함
        //DLL경로 지정 (빌드시 빌드경로로 수정)
        // 경로를 저장할 멤버 변수를 선언합니다.
        private string THISCLASSDLLPATH;
        private string ADDINFOLDERPATH;
        #endregion

        #region 수정하지 말것
        // (수정x)
        public Autodesk.Revit.UI.Result OnStartup(UIControlledApplication uiConApp)
        {
            // Revit 버전을 동적으로 가져와 경로를 설정합니다.
            string version = uiConApp.ControlledApplication.VersionNumber;
            string addinsFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Autodesk",
                "Revit",
                "Addins",
                version);

            // 1단계에서 선언한 멤버 변수에 실제 경로를 할당합니다.
            THISCLASSDLLPATH = Path.Combine(addinsFolder,
                "CostEstimator_RevitAddin_2026",
                "Debug",
                "net8.0-windows",
                "AiBimCost.dll");
            
            ADDINFOLDERPATH = Path.Combine(addinsFolder, "CostEstimator_RevitAddin_2026");

            // 경로 설정이 끝난 후 리본 패널을 생성합니다.
            CreateRibbonPanel(uiConApp);
            return Autodesk.Revit.UI.Result.Succeeded;
        }

        public Autodesk.Revit.UI.Result OnShutdown(UIControlledApplication uiConApp)
        {
            return Autodesk.Revit.UI.Result.Succeeded;
        }
        #endregion

        #region 메인 도구
        // 메인(도구 추가할 경우 추가 및 관리)
        private void CreateRibbonPanel(UIControlledApplication uiConApp)
        {
            #region 도구생성용 변수-수정x
            string tabName;
            string panelName;
            string toolName;
            string innerToolName;
            string toolTip;
            string classPath;
            string contextHelp;
            string iconImagePath;
            RibbonPanel ribbonPanel = null;
            PushButton pushButton = null;
            BitmapImage bitmap = null;
            #endregion




            #region QuantityTakeoff_web
            // Input
            tabName = "AiBim";
            panelName = "QuantityTakeoff";
            toolName = "수량산출(web)";
            innerToolName = "수량산출(web)";
            toolTip = "수량산출(web)";
            classPath = "AiBimCost.MainTools.QuantityTakeoff_web.Command";
            contextHelp = "-";
            iconImagePath = Path.Combine(ADDINFOLDERPATH, "Icons", "Tool.png");

            #region Creating - 수정x
            // Create Tab
            try
            {
                uiConApp.CreateRibbonTab(tabName);
            }
            catch { }

            // Create Panel
            try
            {
                ribbonPanel = uiConApp.CreateRibbonPanel(tabName, panelName);
            }
            catch { }
            // Create Tool
            pushButton = ribbonPanel.AddItem(new PushButtonData(innerToolName, toolName, THISCLASSDLLPATH, classPath)) as PushButton;
            pushButton.ToolTip = toolTip;
            pushButton.SetContextualHelp(new ContextualHelp(ContextualHelpType.Url, contextHelp));

            bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.UriSource = new Uri(iconImagePath);
            bitmap.DecodePixelWidth = 32;  // 추가
            bitmap.DecodePixelHeight = 32; // 추가
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.EndInit();

            pushButton.LargeImage = bitmap;
            #endregion
            #endregion







        }
        #endregion

    }
}
