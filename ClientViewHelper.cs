using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using System.Web.Mvc.Html;
using System.IO;
using System.Text;

namespace Knockout
{
    public static class ClientViewHelper {
        public static MvcHtmlString LoadClientViews(this HtmlHelper Helper, string VirtualPath) {
            string path = VirtualPathUtility.AppendTrailingSlash(VirtualPath);
            var directory = new DirectoryInfo(HttpContext.Current.Server.MapPath(path));
            var output = new StringBuilder();

            foreach (var file in directory.GetFiles()) {
                string viewName = Path.GetFileNameWithoutExtension(file.Name);

                output.Append(@"<script type=""text/html"" id=""").Append(viewName).Append(@""">");
                output.Append(Helper.Partial(path + file.Name));
                output.Append(@"</script>");
            }

            return new MvcHtmlString(output.ToString());
        }
    }
}