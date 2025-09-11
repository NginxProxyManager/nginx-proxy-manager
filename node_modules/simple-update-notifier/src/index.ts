import isNpmOrYarn from './isNpmOrYarn';
import hasNewVersion from './hasNewVersion';
import { IUpdate } from './types';
import borderedText from './borderedText';

const simpleUpdateNotifier = async (args: IUpdate) => {
  if (
    !args.alwaysRun &&
    (!process.stdout.isTTY || (isNpmOrYarn && !args.shouldNotifyInNpmScript))
  ) {
    return;
  }

  try {
    const latestVersion = await hasNewVersion(args);
    if (latestVersion) {
      console.log(
        borderedText(`New version of ${args.pkg.name} available!
Current Version: ${args.pkg.version}
Latest Version: ${latestVersion}`)
      );
    }
  } catch {
    // Catch any network errors or cache writing errors so module doesn't cause a crash
  }
};

export default simpleUpdateNotifier;
