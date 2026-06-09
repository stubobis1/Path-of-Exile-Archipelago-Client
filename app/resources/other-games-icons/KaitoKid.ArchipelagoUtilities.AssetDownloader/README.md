This is a simple readme made to give an idea on how to use the asset downloader

---
### Step 1. Extend ILogger
You will need to create a logger that extends from `KaitoKid.Utilities.Interfaces.ILogger`

here is a template for `MelonLoader` 
```csharp
public class Logger : ILogger
{
    public void LogError(string message) => Core.Log?.Error(message);
    public void LogError(string message, Exception e) => Core.Log?.Error(message, e);
    public void LogWarning(string message) => Core.Log?.Warning(message);
    public void LogInfo(string message) => Core.Log?.Msg(message);
    public void LogMessage(string message) => Core.Log?.Msg(message);
    public void LogDebug(string message) => Core.Log?.Msg(message);

    public void LogDebugPatchIsRunning(string patchedType, string patchedMethod, string patchType, string patchMethod,
        params object[] arguments)
        => Core.Log?.Msg($"Debug Patch: [{patchedMethod}] -> [{patchMethod}]");

    public void LogDebug(string message, params object[] arguments) => Core.Log?.Msg(message);
    public void LogErrorException(string prefixMessage, Exception ex, params object[] arguments) => Core.Log?.Error(ex);

    public void LogWarningException(string prefixMessage, Exception ex, params object[] arguments)
        => Core.Log?.Error(ex);

    public void LogErrorException(Exception ex, params object[] arguments) => Core.Log?.Error(ex);
    public void LogWarningException(Exception ex, params object[] arguments) => Core.Log?.Error(ex);
    public void LogErrorMessage(string message, params object[] arguments) => Core.Log?.Error(message);

    public void LogErrorException(string patchType, string patchMethod, Exception ex, params object[] arguments)
        => Core.Log?.Error(ex);
}
```
> Core.Log is a Singleton of MelonMod's `MelonLogger.Instance LoggerInstance`

---
### Step 2. Extend IAssetLocation
Next you will need to create a class that extends from `IAssetLocation`
here is a template you can use
```csharp
public class AssetItem(string game, string item, ItemFlags flags) : IAssetLocation
{
    public int GetSeed() => 0; // this is the seed used for random asset picking
    public string GameName { get; } = game; // this is the game the asset is from
    public string ItemName { get; } = item; // this is the item
    public ItemFlags ItemFlags { get; } = flags; // these are the flags the item has

    // this is an implicit conversion from `Archipelago.MultiClient.Net`'s `ScoutedItemInfo` feel free to comment this out if you aren't using multiclient
    public static implicit operator AssetItem(ScoutedItemInfo item) => new(item.ItemGame, item.ItemName, item.Flags);
```

---
### Step 3. Create the Downloader
Next you need to create an instance of `ArchipelagoItemSprites` 
```csharp
/// <param name="stringToAliasConversion">`stringToAliasConversion` is for converting a JSON formatted string into an ItemSpriteAliases. This ensures that the library doesn't import a JSON conversion dependency.</param>
ArchipelagoItemSprites(ILogger Logger, Func<string, ItemSpriteAliases> stringToAliasConversion);
```
> I would recommend making this a static singleton somewhere

---
### Step 4. Getting Sprite Paths
Finally, time to get a sprite path. call `ArchipelagoItemSprites`'s  `TryGetCustomAsset` function as follows:

```csharp
/// <param name="myGameName">The name of the game you are modding.</param>
/// <param name="fallbackOnDifferentGameAsset">if this is true then:
///- it will try to get a sprite from `myGameName` that matches the item name if the game the location is from doesn't have an asset
///- if that fails, it will try to get a random sprite from any game that matches the item name
/// </param>
/// <param name="fallbackOnGenericGameAsset">it will get the default sprite of the game the location is from, if the game doesn't have an asset that matches</param>
/// <returns>bool - true if the function succeeded, false if failed</returns>
TryGetCustomAsset(
    IAssetLocation scoutedLocation,
    string myGameName,
    bool fallbackOnDifferentGameAsset,
    bool fallbackOnGenericGameAsset, 
    out ItemSprite sprite 
)
```

> `fallbackOnDifferentGameAsset` will be tested before `fallbackOnGenericGameAsset`

the file path is stored in the `sprite.FilePath` as a string