using System;
using KaitoKid.Utilities.Interfaces;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader.ItemSprites
{
    public class ArchipelagoItemSprites
    {
        public const string ALIASES_FILE_NAME = "aliases.json";

        private ILogger _logger;
        private NameCleaner _nameCleaner;
        private AssetService _assetService;
        private string _spritesFolder;
        private Dictionary<string, List<ItemSprite>> _spritesByGame;
        private Dictionary<string, List<ItemSprite>> _spritesByItemName;
        private Dictionary<string, Dictionary<string, ItemSprite>> _spritesByGameByItemName;
        private Func<string, ItemSpriteAliases> _aliasConversion;

        /// <param name="stringToAliasConversion">`stringToAliasConversion` is for converting a JSON formatted string into an ItemSpriteAliases. This ensures that the library doesn't import a JSON conversion dependency.</param>
        public ArchipelagoItemSprites(ILogger logger,  Func<string, ItemSpriteAliases> stringToAliasConversion, TimeSpan? timeUntilRedownloadAssets = null)
        {
            _logger = logger;
            _nameCleaner = new NameCleaner();
            _assetService = new AssetService(timeUntilRedownloadAssets);
            _spritesFolder = Paths.CustomAssetsDirectory;
            _aliasConversion = stringToAliasConversion;
            
            LoadCustomSprites();
        }

        public bool HasSpritesForGame(string gameName)
        {
            var cleanGame = _nameCleaner.CleanName(gameName);
            return _spritesByGame.ContainsKey(cleanGame) || _spritesByGameByItemName.ContainsKey(cleanGame);
        }

        private void LoadCustomSprites()
        {
            _spritesByGame = new Dictionary<string, List<ItemSprite>>();
            _spritesByItemName = new Dictionary<string, List<ItemSprite>>();
            _spritesByGameByItemName = new Dictionary<string, Dictionary<string, ItemSprite>>();

            if (string.IsNullOrWhiteSpace(_spritesFolder))
            {
                _logger.LogError("Could not find Custom Assets Directory");
                return;
            }

            if (!Directory.Exists(_spritesFolder))
            {
                Directory.CreateDirectory(_spritesFolder);
            }

            var gameSubfolders = Directory.EnumerateDirectories(_spritesFolder, "*", SearchOption.TopDirectoryOnly).ToArray();
            foreach (var gameSubfolder in gameSubfolders)
            {
                RegisterGameSprites(gameSubfolder);
            }
        }

        internal void RegisterGameSprites(string gameSubfolder)
        {
            var aliases = GetAliases(gameSubfolder);
            RegisterDirectSprites(gameSubfolder, out var gameName);
            RegisterAliasSprites(aliases, gameName);
        }

        private ItemSpriteAliases GetAliases(string gameSubfolder)
        {
            try
            {
                var aliasesFile = Path.Combine(gameSubfolder, ALIASES_FILE_NAME);
                if (File.Exists(aliasesFile))
                {
                    return _aliasConversion(File.ReadAllText(aliasesFile));
                }
            }
            catch (Exception e)
            {
                _logger.LogError($"Error getting the aliases in {gameSubfolder}. {e.Message}", e);
            }

            return new ItemSpriteAliases();
        }

        private void RegisterDirectSprites(string spritesGameFolder)
        {
            RegisterDirectSprites(spritesGameFolder, out _);
        }

        private void RegisterDirectSprites(string spritesGameFolder, out string game)
        {
            game = string.Empty;
            var files = Directory.EnumerateFiles(spritesGameFolder, "*.png", SearchOption.AllDirectories);
            foreach (var file in files)
            {
                RegisterSprite(file, out game);
            }
        }

        private void RegisterAliasSprites(ItemSpriteAliases aliases, string gameName)
        {
            foreach (var alias in aliases.Aliases)
            {
                foreach (var aliasItemName in alias.ItemNames)
                {
                    var cleanGame = _nameCleaner.CleanName(gameName);
                    var cleanAliasName = _nameCleaner.CleanName(alias.AliasName);
                    if (_spritesByGameByItemName.ContainsKey(cleanGame) &&
                        _spritesByGameByItemName[cleanGame].ContainsKey(cleanAliasName))
                    {
                        var aliasSprite = _spritesByGameByItemName[cleanGame][cleanAliasName];
                        RegisterSprite(gameName, aliasItemName, aliasSprite, false);
                    }
                }
            }
        }

        internal void RegisterSprite(string file, out string game)
        {
            var sprite = new ItemSprite(_logger, file);
            RegisterSprite(sprite.Game, sprite.Item, sprite, true);
            game = sprite.Game;
        }

        private void RegisterSprite(string game, string item, ItemSprite sprite, bool overrideIfExists)
        {
            var cleanGame = _nameCleaner.CleanName(game);
            var cleanItem = _nameCleaner.CleanName(item);
            if (!_spritesByGame.ContainsKey(cleanGame))
            {
                _spritesByGame.Add(cleanGame, new List<ItemSprite>());
            }
            if (!_spritesByItemName.ContainsKey(cleanItem))
            {
                _spritesByItemName.Add(cleanItem, new List<ItemSprite>());
            }
            if (!_spritesByGameByItemName.ContainsKey(cleanGame))
            {
                _spritesByGameByItemName.Add(cleanGame, new Dictionary<string, ItemSprite>());
            }

            _spritesByGame[cleanGame].Add(sprite);
            _spritesByItemName[cleanItem].Add(sprite);
            if (!_spritesByGameByItemName[cleanGame].ContainsKey(cleanItem))
            {
                _spritesByGameByItemName[cleanGame].Add(cleanItem, sprite);
            }
            else if (overrideIfExists)
            {
                _spritesByGameByItemName[cleanGame][cleanItem] = sprite;
            }
        }

        public void PrepareGameAssets(string gameName)
        {
            _assetService.TryDownloadGameAssets(gameName, this, false);
        }

        /// <param name="myGameName">The name of the game you are modding.</param>
        /// <param name="fallbackOnDifferentGameAsset">if this is true then:
        ///- it will try to get a sprite from `myGameName` that matches the item name if the game the location is from doesn't have an asset
        ///- if that fails, it will try to get a random sprite from any game that matches the item name
        /// </param>
        /// <param name="fallbackOnGenericGameAsset">it will get the default sprite of the game the location is from, if the game doesn't have an asset that matches</param>
        /// <returns>bool - true if the function succeeded, false if failed</returns>
        public bool TryGetCustomAsset(IAssetLocation scoutedLocation, string myGameName, bool fallbackOnDifferentGameAsset, bool fallbackOnGenericGameAsset, out ItemSprite sprite)
        {
            var myGame = _nameCleaner.RemoveIllegalCharacters(myGameName);
            _assetService.TryDownloadGameAssets(myGame, this, true);
            sprite = null;
            if (scoutedLocation == null)
            {
                return false;
            }

            var game = _nameCleaner.RemoveIllegalCharacters(scoutedLocation.GameName);
            _assetService.TryDownloadGameAssets(game, this, true);

            var cleanMyGame = _nameCleaner.CleanName(myGameName);
            var cleanScoutedGame = _nameCleaner.CleanName(scoutedLocation.GameName);
            var cleanItem = _nameCleaner.CleanName(scoutedLocation.ItemName);
            if (_spritesByGameByItemName.TryGetValue(cleanMyGame, out var itemsInCorrectGame))
            {
                if (itemsInCorrectGame.TryGetValue(cleanItem, out sprite))
                {
                    return true;
                }
            }

            // _assetService.TryDownloadAsset(scoutedLocation.GameName, scoutedLocation.ItemName, this);

            if (fallbackOnDifferentGameAsset && _spritesByGameByItemName.TryGetValue(cleanMyGame, out var itemsInMyGame))
            {
                if (itemsInMyGame.TryGetValue(cleanItem, out sprite))
                {
                    return true;
                }
            }

            if (fallbackOnDifferentGameAsset && _spritesByItemName.TryGetValue(cleanItem, out var spritesWithCorrectName) && spritesWithCorrectName.Any())
            {
                var random = new Random(scoutedLocation.GetSeed());
                var index = random.Next(0, spritesWithCorrectName.Count);
                sprite = spritesWithCorrectName[index];
                return true;
            }

            if (fallbackOnGenericGameAsset && _spritesByGameByItemName.TryGetValue(cleanScoutedGame, out itemsInCorrectGame))
            {
                if (itemsInCorrectGame.TryGetValue(string.Empty, out sprite))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
