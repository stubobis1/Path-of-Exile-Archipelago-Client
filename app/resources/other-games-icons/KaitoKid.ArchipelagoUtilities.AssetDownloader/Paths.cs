using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader
{
    public static class Paths
    {
        public static readonly string DownloadDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ArchipelagoUtilities");

        public static readonly string CustomAssetsDirectory = Path.Combine(DownloadDirectory, "Custom Assets");

        public const string REPOSITORY_URL = "https://raw.githubusercontent.com/agilbert1412/ArchipelagoUtilities/";
        public const string GIT_BRANCH = "main"; // "AssetDownloader";

        public const string PROJECT_PATH = "/KaitoKid.ArchipelagoUtilities.Net/KaitoKid.ArchipelagoUtilities.AssetDownloader/";

        public const string WEB_DOWNLOAD_URL = REPOSITORY_URL + GIT_BRANCH + PROJECT_PATH;
        public const string ASSETS_FOLDER = "Assets/";
        public const string ZIPPED_ASSETS_FOLDER = "ZippedAssets/";
        public const string WEB_DOWNLOAD_ASSETS = WEB_DOWNLOAD_URL + ASSETS_FOLDER;
        public const string WEB_DOWNLOAD_ZIPPED_ASSETS = WEB_DOWNLOAD_URL + ZIPPED_ASSETS_FOLDER;
    }
}
