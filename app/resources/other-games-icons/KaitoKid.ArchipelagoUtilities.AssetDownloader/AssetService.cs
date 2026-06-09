using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using KaitoKid.ArchipelagoUtilities.AssetDownloader.Extensions;
using KaitoKid.ArchipelagoUtilities.AssetDownloader.ItemSprites;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader
{
    public class AssetService
    {
        private static readonly TimeSpan NEVER_REDOWNLOAD = TimeSpan.MaxValue;

        private Downloader _downloader;
        private HashSet<string> _downloadedGameZips;
        private HashSet<string> _downloadedSpecificAssets;
        private TimeSpan _timeUntilRedownloadAssets;

        public AssetService(TimeSpan? timeUntilRedownloadAssets)
        {
            _downloader = new Downloader();
            _downloadedGameZips = new HashSet<string>();
            _downloadedSpecificAssets = new HashSet<string>();
            _timeUntilRedownloadAssets = timeUntilRedownloadAssets ?? NEVER_REDOWNLOAD;
        }

        public void TryDownloadGameAssets(string gameName, ArchipelagoItemSprites itemSprites, bool async)
        {
            if (!_downloadedGameZips.Add(gameName))
            {
                return;
            }

            if (async)
            {
                TryDownloadGameAssetsAsync(gameName, itemSprites).FireAndForget();
            }
            else
            {
                TryDownloadGameAssetsSync(gameName, itemSprites);
            }
        }

        private async Task TryDownloadGameAssetsAsync(string gameName, ArchipelagoItemSprites itemSprites)
        {
            TryDownloadGameAssetsSync(gameName, itemSprites);
        }

        private void TryDownloadGameAssetsSync(string gameName, ArchipelagoItemSprites itemSprites)
        {
            var zipPath = Path.Combine(Paths.CustomAssetsDirectory, $"{gameName}.zip");
            var hasZip = File.Exists(zipPath) && (DateTime.Now - new FileInfo(zipPath).LastWriteTime) < _timeUntilRedownloadAssets;
            var downloadedNewZip = false;
            if (!hasZip)
            {
                var success = _downloader.DownloadGameZip(gameName);
                if (success)
                {
                    hasZip = true;
                    downloadedNewZip = true;
                }
            }

            var gamePath = Path.Combine(Paths.CustomAssetsDirectory, $"{gameName}");
            var hasSprites = Directory.Exists(gamePath);
            if (downloadedNewZip || (hasZip && !hasSprites))
            {
                hasSprites = _downloader.UnzipGameZip(gameName);
            }

            if (hasSprites)
            {
                itemSprites.RegisterGameSprites(gamePath);
            }
        }

        public void TryDownloadAsset(string gameName, string itemName, ArchipelagoItemSprites itemSprites)
        {
            var hashKey = GetKey(gameName, itemName);
            if (_downloadedSpecificAssets.Contains(hashKey))
            {
                return;
            }

            _downloadedSpecificAssets.Add(hashKey);

            TryDownloadAssetAsync(gameName, itemName, itemSprites).FireAndForget();

        }

        private async Task TryDownloadAssetAsync(string gameName, string itemName, ArchipelagoItemSprites itemSprites)
        {
            var assetPath = Path.Combine(Paths.CustomAssetsDirectory, gameName, $"{gameName}_{itemName}.png");
            if (File.Exists(assetPath))
            {
                return;
            }

            if (_downloader.DownloadSpecificItemAsset(gameName, itemName, out var fileName))
            {
                itemSprites.RegisterSprite(fileName, out _);
            }
        }

        private string GetKey(string gameName, string itemName)
        {
            return $"{gameName}_{itemName}";
        }
    }
}
