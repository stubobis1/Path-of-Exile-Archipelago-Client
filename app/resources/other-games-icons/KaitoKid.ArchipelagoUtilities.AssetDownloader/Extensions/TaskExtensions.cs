using System;
using System.Diagnostics;
using System.Threading.Tasks;
using KaitoKid.Utilities.Interfaces;

namespace KaitoKid.ArchipelagoUtilities.AssetDownloader.Extensions
{
    public static class TaskExtensions
    {
        public static async void FireAndForget(this Task task)
        {
            try
            {
                await task;
            }
            catch (Exception ex)
            {
                Debugger.Break();
            }
        }
    }
}
