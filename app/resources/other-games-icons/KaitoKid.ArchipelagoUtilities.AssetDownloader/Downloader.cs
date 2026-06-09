using System;
using System.IO;
using System.IO.Compression;
using System.Net;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader
{
    public class Downloader
    {
        private NameCleaner _nameCleaner;

        public Downloader()
        {
            _nameCleaner = new NameCleaner();
        }

        public bool DownloadGameZip(string game)
        {
            try
            {
                var zipName = $"{game}.zip";
                var webPath = $"{Paths.WEB_DOWNLOAD_ZIPPED_ASSETS}{zipName}";
                var localPath = Path.Combine(Paths.CustomAssetsDirectory, zipName);
                return DownloadFile(webPath, localPath);
            }
            catch
            {
                return false;
            }
        }

        public bool UnzipGameZip(string game)
        {
            try
            {
                var zipName = $"{game}.zip";
                var zipFile = Path.Combine(Paths.CustomAssetsDirectory, zipName);
                var path = Path.Combine(Paths.CustomAssetsDirectory, game);
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                }
                ZipFile.ExtractToDirectory(zipFile, Paths.CustomAssetsDirectory);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public bool DownloadSpecificItemAsset(string game, string itemName)
        {
            return DownloadSpecificItemAsset(game, itemName, out _);
        }

        public bool DownloadSpecificItemAsset(string game, string itemName, out string fileName)
        {
            var assetName = $"{game}_{itemName}.png";
            return DownloadSpecificAsset(game, assetName, out fileName);
        }

        private bool DownloadSpecificAsset(string game, string assetName, out string fileName)
        {
            try
            {
                var filePath = Path.Combine(game, assetName);
                var webPath = $"{Paths.WEB_DOWNLOAD_ASSETS}{game}/{assetName}";
                fileName = Path.Combine(Paths.CustomAssetsDirectory, filePath);
                return DownloadFile(webPath, fileName);
            }
            catch
            {
                fileName = "";
                return false;
            }
        }

        private static bool DownloadFile(string originPath, string destinationPath)
        {
            var fileAlreadyExists = File.Exists(destinationPath);
            try
            {
                if (!Directory.Exists(Paths.CustomAssetsDirectory))
                {
                    Directory.CreateDirectory(Paths.CustomAssetsDirectory);
                }
                using (var client = new WebClient())
                {
                    client.Credentials = CredentialCache.DefaultNetworkCredentials;
                    client.DownloadFile(originPath, destinationPath);
                    return true;
                }
            }
            catch (Exception ex)
            {
                if (!fileAlreadyExists && File.Exists(destinationPath))
                {
                    File.Delete(destinationPath);
                }
                return false;
            }
        }
    }
}
