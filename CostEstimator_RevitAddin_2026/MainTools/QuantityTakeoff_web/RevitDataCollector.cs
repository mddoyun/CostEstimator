// RevitDataCollector.cs
using Autodesk.Revit.DB;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;

namespace RevitDjangoConnector
{
    public static class RevitDataCollector
    {
        // 이 코드 블록 전체를 복사하여 RevitDataCollector.cs 파일의 기존 GetAllElementsAsString 메소드와 교체하세요.
        // ▼▼▼ [수정] 기존 GetAllElementsAsString을 아래 코드로 교체해주세요. ▼▼▼
        public static List<string> SerializeElementsToStringList(List<Element> elements, Document doc)
        {
            var elementDataList = new List<string>();

            foreach (Element element in elements)
            {
                if (element == null || element.Category == null) continue;

                var elementDict = new Dictionary<string, object>
                {
                    ["Name"] = element.Name,
                    ["Category"] = element.Category.Name,
                    ["ElementId"] = element.Id.Value, // <-- 최종 수정
                    ["UniqueId"] = element.UniqueId
                };

                var parameters = new Dictionary<string, string>();
                foreach (Parameter param in element.Parameters)
                {
                    if (param.HasValue)
                    {
                        parameters[param.Definition.Name] = param.AsValueString() ?? param.AsString();
                    }
                }
                elementDict["Parameters"] = parameters;

                Element elementType = doc.GetElement(element.GetTypeId());
                if (elementType != null)
                {
                    var typeParameters = new Dictionary<string, string>();
                    foreach (Parameter param in elementType.Parameters)
                    {
                        if (param.HasValue)
                        {
                            typeParameters[param.Definition.Name] = param.AsValueString() ?? param.AsString();
                        }
                    }
                    elementDict["TypeParameters"] = typeParameters;
                }

                elementDataList.Add(JsonConvert.SerializeObject(elementDict));
            }
            return elementDataList;
        }

    }
}