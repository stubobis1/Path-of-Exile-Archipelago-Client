using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader
{
    public class NameCleaner
    {
        public string CleanName(string name)
        {
            if (name == null)
            {
                return string.Empty;
            }

            name = name.ToLower();
            name = RemoveUncleanCharacters(name);
            return name;
        }

        public string RemoveUncleanCharacters(string name)
        {
            var charsToIgnore = new string[] { " ", "_", "'", };
            foreach (var charToIgnore in charsToIgnore)
            {
                name = name.Replace(charToIgnore, "");
            }

            name = RemoveIllegalCharacters(name);

            return name;
        }

        public string RemoveIllegalCharacters(string name)
        {
            var charsToIgnore = new string[] { ":", "<", ">" };
            foreach (var charToIgnore in charsToIgnore)
            {
                name = name.Replace(charToIgnore, "");
            }

            return name;
        }
    }
}
