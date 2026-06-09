using System;
using System.IO;
using System.Linq;
using KaitoKid.Utilities.Interfaces;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader.ItemSprites
{
    public class ItemSprite
    {
        private readonly ILogger _logger;
        public string Game { get; }
        public string Item { get; }
        public string FilePath { get; }
        public string FileName { get; }

        public ItemSprite(ILogger logger, string filePath)
        {
            _logger = logger;
            FilePath = filePath;
            var fileInfo = new FileInfo(filePath);
            FileName = fileInfo.Name;
            FileName = FileName.Substring(0, FileName.Length - fileInfo.Extension.Length);
            var gameAndItem = GetGameAndItem(_logger, FileName);
            Game = gameAndItem.Item1;
            Item = gameAndItem.Item2;
        }

        public static Tuple<string, string> GetGameAndItem(ILogger logger, string fileName)
        {
            var parts = fileName.Split('_');

            string gameName, itemName;

            if (parts.Length == 1)
            {
                gameName = parts[0];
                itemName = string.Empty;
                return new Tuple<string, string>(gameName, itemName);
            }

            if (parts.Length < 2)
            {
                logger.LogError("Found a custom sprite with 3 parts instead of 2");
            }

            gameName = parts.First();
            itemName = string.Join("_", parts.Skip(1));
            return new Tuple<string, string>(gameName, itemName);
        }
    }
}
