<p align="center">
  <a href="https://nodemon.io/"><img src="https://user-images.githubusercontent.com/13700/35731649-652807e8-080e-11e8-88fd-1b2f6d553b2d.png" alt="Nodemon Logo"></a>
</p>

# nodemon

nodemon is a tool that helps develop Node.js based applications by automatically restarting the node application when file changes in the directory are detected.

nodemon does **not** require *any* additional changes to your code or method of development. nodemon is a replacement wrapper for `node`. To use `nodemon`, replace the word `node` on the command line when executing your script.

[![NPM version](https://badge.fury.io/js/nodemon.svg)](https://npmjs.org/package/nodemon)
[![Travis Status](https://travis-ci.org/remy/nodemon.svg?branch=master)](https://travis-ci.org/remy/nodemon) [![Backers on Open Collective](https://opencollective.com/nodemon/backers/badge.svg)](#backers) [![Sponsors on Open Collective](https://opencollective.com/nodemon/sponsors/badge.svg)](#sponsors)

# Installation

Either through cloning with git or by using [npm](http://npmjs.org) (the recommended way):

```bash
npm install -g nodemon # or using yarn: yarn global add nodemon
```

And nodemon will be installed globally to your system path.

You can also install nodemon as a development dependency:

```bash
npm install --save-dev nodemon # or using yarn: yarn add nodemon -D
```

With a local installation, nodemon will not be available in your system path or you can't use it directly from the command line. Instead, the local installation of nodemon can be run by calling it from within an npm script (such as `npm start`) or using `npx nodemon`.

# Usage

nodemon wraps your application, so you can pass all the arguments you would normally pass to your app:

```bash
nodemon [your node app]
```

For CLI options, use the `-h` (or `--help`) argument:

```bash
nodemon -h
```

Using nodemon is simple, if my application accepted a host and port as the arguments, I would start it as so:

```bash
nodemon ./server.js localhost 8080
```

Any output from this script is prefixed with `[nodemon]`, otherwise all output from your application, errors included, will be echoed out as expected.

You can also pass the `inspect` flag to node through the command line as you would normally:

```bash
nodemon --inspect ./server.js 80
```

If you have a `package.json` file for your app, you can omit the main script entirely and nodemon will read the `package.json` for the `main` property and use that value as the app ([ref](https://github.com/remy/nodemon/issues/14)).

nodemon will also search for the `scripts.start` property in `package.json` (as of nodemon 1.1.x).

Also check out the [FAQ](https://github.com/remy/nodemon/blob/master/faq.md) or [issues](https://github.com/remy/nodemon/issues) for nodemon.

## Automatic re-running

nodemon was originally written to restart hanging processes such as web servers, but now supports apps that cleanly exit. If your script exits cleanly, nodemon will continue to monitor the directory (or directories) and restart the script if there are any changes.

## Manual restarting

Whilst nodemon is running, if you need to manually restart your application, instead of stopping and restart nodemon, you can type `rs` with a carriage return, and nodemon will restart your process.

## Config files

nodemon supports local and global configuration files. These are usually named `nodemon.json` and can be located in the current working directory or in your home directory. An alternative local configuration file can be specified with the `--config <file>` option.

The specificity is as follows, so that a command line argument will always override the config file settings:

- command line arguments
- local config
- global config

A config file can take any of the command line arguments as JSON key values, for example:

```json
{
  "verbose": true,
  "ignore": ["*.test.js", "**/fixtures/**"],
  "execMap": {
    "rb": "ruby",
    "pde": "processing --sketch={{pwd}} --run"
  }
}
```

The above `nodemon.json` file might be my global config so that I have support for ruby files and processing files, and I can run `nodemon demo.pde` and nodemon will automatically know how to run the script even though out of the box support for processing scripts.

A further example of options can be seen in [sample-nodemon.md](https://github.com/remy/nodemon/blob/master/doc/sample-nodemon.md)

### package.json

If you want to keep all your package configurations in one place, nodemon supports using `package.json` for configuration.
Specify the config in the same format as you would for a config file but under `nodemonConfig` in the `package.json` file, for example, take the following `package.json`:

```json
{
  "name": "nodemon",
  "homepage": "http://nodemon.io",
  "...": "... other standard package.json values",
  "nodemonConfig": {
    "ignore": ["**/test/**", "**/docs/**"],
    "delay": 2500
  }
}
```

Note that if you specify a `--config` file or provide a local `nodemon.json` any `package.json` config is ignored.

*This section needs better documentation, but for now you can also see `nodemon --help config` ([also here](https://github.com/remy/nodemon/blob/master/doc/cli/config.txt))*.

## Using nodemon as a module

Please see [doc/requireable.md](doc/requireable.md)

## Using nodemon as child process

Please see [doc/events.md](doc/events.md#Using_nodemon_as_child_process)

## Running non-node scripts

nodemon can also be used to execute and monitor other programs. nodemon will read the file extension of the script being run and monitor that extension instead of `.js` if there's no `nodemon.json`:

```bash
nodemon --exec "python -v" ./app.py
```

Now nodemon will run `app.py` with python in verbose mode (note that if you're not passing args to the exec program, you don't need the quotes), and look for new or modified files with the `.py` extension.

### Default executables

Using the `nodemon.json` config file, you can define your own default executables using the `execMap` property. This is particularly useful if you're working with a language that isn't supported by default by nodemon.

To add support for nodemon to know about the `.pl` extension (for Perl), the `nodemon.json` file would add:

```json
{
  "execMap": {
    "pl": "perl"
  }
}
```

Now running the following, nodemon will know to use `perl` as the executable:

```bash
nodemon script.pl
```

It's generally recommended to use the global `nodemon.json` to add your own `execMap` options. However, if there's a common default that's missing, this can be merged in to the project so that nodemon supports it by default, by changing [default.js](https://github.com/remy/nodemon/blob/master/lib/config/defaults.js) and sending a pull request.

## Monitoring multiple directories

By default nodemon monitors the current working directory. If you want to take control of that option, use the `--watch` option to add specific paths:

```bash
nodemon --watch app --watch libs app/server.js
```

Now nodemon will only restart if there are changes in the `./app` or `./libs` directory. By default nodemon will traverse sub-directories, so there's no need in explicitly including sub-directories.

Nodemon also supports unix globbing, e.g `--watch './lib/*'`. The globbing pattern must be quoted.

## Specifying extension watch list

By default, nodemon looks for files with the `.js`, `.mjs`, `.coffee`, `.litcoffee`, and `.json` extensions. If you use the `--exec` option and monitor `app.py` nodemon will monitor files with the extension of `.py`. However, you can specify your own list with the `-e` (or `--ext`) switch like so:

```bash
nodemon -e js,pug
```

Now nodemon will restart on any changes to files in the directory (or subdirectories) with the extensions `.js`, `.pug`.

## Ignoring files

By default, nodemon will only restart when a `.js` JavaScript file changes. In some cases you will want to ignore some specific files, directories or file patterns, to prevent nodemon from prematurely restarting your application.

This can be done via the command line:

```bash
nodemon --ignore lib/ --ignore tests/
```

Or specific files can be ignored:

```bash
nodemon --ignore lib/app.js
```

Patterns can also be ignored (but be sure to quote the arguments):

```bash
nodemon --ignore 'lib/*.js'
```

**Important** the ignore rules are patterns matched to the full absolute path, and this determines how many files are monitored. If using a wild card glob pattern, it needs to be used as `**` or omitted entirely. For example, `nodemon --ignore '**/test/**'` will work, whereas `--ignore '*/test/*'` will not.

Note that by default, nodemon will ignore the `.git`, `node_modules`, `bower_components`, `.nyc_output`, `coverage` and `.sass-cache` directories and *add* your ignored patterns to the list. If you want to indeed watch a directory like `node_modules`, you need to [override the underlying default ignore rules](https://github.com/remy/nodemon/blob/master/faq.md#overriding-the-underlying-default-ignore-rules).

## Application isn't restarting

In some networked environments (such as a container running nodemon reading across a mounted drive), you will need to use the `legacyWatch: true` which enables Chokidar's polling.

Via the CLI, use either `--legacy-watch` or `-L` for short:

```bash
nodemon -L
```

Though this should be a last resort as it will poll every file it can find.

## Delaying restarting

In some situations, you may want to wait until a number of files have changed. The timeout before checking for new file changes is 1 second. If you're uploading a number of files and it's taking some number of seconds, this could cause your app to restart multiple times unnecessarily.

To add an extra throttle, or delay restarting, use the `--delay` command:

```bash
nodemon --delay 10 server.js
```

For more precision, milliseconds can be specified.  Either as a float:

```bash
nodemon --delay 2.5 server.js
```

Or using the time specifier (ms):

```bash
nodemon --delay 2500ms server.js
```

The delay figure is number of seconds (or milliseconds, if specified) to delay before restarting. So nodemon will only restart your app the given number of seconds after the *last* file change.

If you are setting this value in `nodemon.json`, the value will always be interpreted in milliseconds. E.g., the following are equivalent:

```bash
nodemon --delay 2.5

{
  "delay": 2500
}
```

## Gracefully reloading down your script

It is possible to have nodemon send any signal that you specify to your application.

```bash
nodemon --signal SIGHUP server.js
```

Your application can handle the signal as follows.

```js
process.once("SIGHUP", function () {
  reloadSomeConfiguration();
})
```

Please note that nodemon will send this signal to every process in the process tree.

If you are using `cluster`, then each workers (as well as the master) will receive the signal. If you wish to terminate all workers on receiving a `SIGHUP`, a common pattern is to catch the `SIGHUP` in the master, and forward `SIGTERM` to all workers, while ensuring that all workers ignore `SIGHUP`.

```js
if (cluster.isMaster) {
  process.on("SIGHUP", function () {
    for (const worker of Object.values(cluster.workers)) {
      worker.process.kill("SIGTERM");
    }
  });
} else {
  process.on("SIGHUP", function() {})
}
```

## Controlling shutdown of your script

nodemon sends a kill signal to your application when it sees a file update. If you need to clean up on shutdown inside your script you can capture the kill signal and handle it yourself.

The following example will listen once for the `SIGUSR2` signal (used by nodemon to restart), run the clean up process and then kill itself for nodemon to continue control:

```js
process.once('SIGUSR2', function () {
  gracefulShutdown(function () {
    process.kill(process.pid, 'SIGUSR2');
  });
});
```

Note that the `process.kill` is *only* called once your shutdown jobs are complete. Hat tip to [Benjie Gillam](http://www.benjiegillam.com/2011/08/node-js-clean-restart-and-faster-development-with-nodemon/) for writing this technique up.

## Triggering events when nodemon state changes

If you want growl like notifications when nodemon restarts or to trigger an action when an event happens, then you can either `require` nodemon or add event actions to your `nodemon.json` file.

For example, to trigger a notification on a Mac when nodemon restarts, `nodemon.json` looks like this:

```json
{
  "events": {
    "restart": "osascript -e 'display notification \"app restarted\" with title \"nodemon\"'"
  }
}
```

A full list of available events is listed on the [event states wiki](https://github.com/remy/nodemon/wiki/Events#states). Note that you can bind to both states and messages.

## Pipe output to somewhere else

```js
nodemon({
  script: ...,
  stdout: false // important: this tells nodemon not to output to console
}).on('readable', function() { // the `readable` event indicates that data is ready to pick up
  this.stdout.pipe(fs.createWriteStream('output.txt'));
  this.stderr.pipe(fs.createWriteStream('err.txt'));
});
```

## Using nodemon in your gulp workflow

Check out the [gulp-nodemon](https://github.com/JacksonGariety/gulp-nodemon) plugin to integrate nodemon with the rest of your project's gulp workflow.

## Using nodemon in your Grunt workflow

Check out the [grunt-nodemon](https://github.com/ChrisWren/grunt-nodemon) plugin to integrate nodemon with the rest of your project's grunt workflow.

## Pronunciation

> nodemon, is it pronounced: node-mon, no-demon or node-e-mon (like pokémon)?

Well...I've been asked this many times before. I like that I've been asked this before. There's been bets as to which one it actually is.

The answer is simple, but possibly frustrating. I'm not saying (how I pronounce it). It's up to you to call it as you like. All answers are correct :)

## Design principles

- Fewer flags is better
- Works across all platforms
- Fewer features
- Let individuals build on top of nodemon
- Offer all CLI functionality as an API
- Contributions must have and pass tests

Nodemon is not perfect, and CLI arguments has sprawled beyond where I'm completely happy, but perhaps it can be reduced a little one day.

## FAQ

See the [FAQ](https://github.com/remy/nodemon/blob/master/faq.md) and please add your own questions if you think they would help others.

## Backers

Thank you to all [our backers](https://opencollective.com/nodemon#backer)! 🙏

[![nodemon backers](https://opencollective.com/nodemon/backers.svg?width=890)](https://opencollective.com/nodemon#backers)

## Sponsors

Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Sponsor this project today ❤️](https://opencollective.com/nodemon#sponsor)

<div style="overflow: hidden; margin-bottom: 80px;"><a title='Netpositive' data-id='162674' href='https://najlepsibukmacherzy.pl/ranking-legalnych-bukmacherow/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/52acecf0-608a-11eb-b17f-5bca7c67fe7b.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='CasinoHEX Australia' data-id='177373' href='https://online-aussie-casino.com/'><img alt='#1 Aussie Gambling Guide' src='https://opencollective-production.s3.us-west-1.amazonaws.com/89ea5890-6d1c-11ea-9dd9-330b3b2faf8b.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='NettiCasinoHEX.com' data-id='177375' href='https://netticasinohex.com/'><img alt='NettiCasinoHEX.com is a real giant among casino guides. It provides Finnish players with the most informative and honest casino rewievs. Beside that, there are free casino games and tips there which help to win the best jackpots.' src='https://opencollective-production.s3.us-west-1.amazonaws.com/b802aa50-7b1a-11ea-bcaf-0dc68ad9bc17.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='KasynoHEX.com' data-id='177376' href='https://polskiekasynohex.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/2bb0d6e0-99c8-11ea-9349-199aa0d5d24a.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casinoonlineaams.com' data-id='198634' href='https://www.casinoonlineaams.com'><img alt='Review of the best online casino in Italy' src='https://opencollective-production.s3.us-west-1.amazonaws.com/a0694620-b88f-11eb-b3a4-b97529e4b911.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casino utan svensk licens' data-id='209052' href='https://www.casinoutanlicens.io/'><img alt='Casino utan svensk licens' src='https://opencollective-production.s3.us-west-1.amazonaws.com/52f13c30-0d78-11eb-88e4-510439e2a88d.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casino Whizz' data-id='215685' href='https://casinowhizz.com'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/23256a80-f5c1-11eb-99f7-fbf8e4d6c6be.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Aussielowdepositcasino' data-id='215800' href='https://aussielowdepositcasino.com/'><img alt='aussielowdepositcasino.com' src='https://user-images.githubusercontent.com/13700/151881982-04677f3d-e2e1-44ee-a168-258b242b1ef4.svg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casinot.net' data-id='220487' href='https://www.casinot.net'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/73b4fc10-7591-11ea-a1d4-01a20d893b4f.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Parhaatkasinot' data-id='220749' href='https://www.parhaatkasinot.com'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/4dfc1820-b6ee-11ea-9fa9-e39f53823609.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Kasinot.fi' data-id='229606' href='https://www.kasinot.fi'><img alt='null' src='https://logo.clearbit.com/www.kasinot.fi' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Beto_mania' data-id='232473' href='https://betomania.pl/ranking-bukmacherow/'><img alt='null' src='https://logo.clearbit.com/betomania.pl' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Targeted Web Traffic' data-id='235849' href='https://www.targetedwebtraffic.com'><img alt='null' src='https://logo.clearbit.com/targetedwebtraffic.com' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casino Wise' data-id='243140' href='https://casino-wise.com/'><img alt='The UK’s number one place for all things GamStop.' src='https://opencollective-production.s3.us-west-1.amazonaws.com/734011b0-46ac-11eb-8d3c-79b2cf7dfe51.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Paraskasino' data-id='248269' href='https://www.paraskasino.fi'><img alt='null' src='https://logo.clearbit.com/www.paraskasino.fi' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Free Bets' data-id='269861' href='https://freebets.ltd.uk'><img alt='Free Bets' src='https://logo.clearbit.com/freebets.ltd.uk' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='TheCasinoDB' data-id='270835' href='https://www.thecasinodb.com'><img alt='null' src='https://logo.clearbit.com/thecasinodb.com' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Online Casinos XYZ' data-id='270836' href='https://online-casinos.xyz'><img alt='Provides reviews of online casinos along with exclusive offers and bonuses.' src='https://opencollective-production.s3.us-west-1.amazonaws.com/bd4ff1f0-279b-11ec-9a5a-0519330cdfea.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Ace Online Casino' data-id='270837' href='https://www.aceonlinecasino.co.uk'><img alt='Offers real money online gambling games, slots, roulette and blackjack to players in the United Kingdom.' src='https://opencollective-production.s3.us-west-1.amazonaws.com/b3376c80-279f-11ec-9a5a-0519330cdfea.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='null' data-id='padlet' href='https://padlet.com'><img alt='null' src='https://images.opencollective.com/padlet/320fa3e/logo/256.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casino Utan Svenska Licensen' data-id='285700' href='https://www.casinoutansvenskalicensen.se/'><img alt='Marketing' src='https://opencollective-production.s3.us-west-1.amazonaws.com/ed105cb0-b01f-11ec-935f-77c14be20a90.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='null' data-id='snyk' href='https://snyk.co/nodemon'><img alt='null' src='https://user-images.githubusercontent.com/13700/165926338-ae9458ab-89c5-4c97-bc9b-86b5049576bf.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Online Casinos Australia' data-id='297999' href='https://online-casinos-australia.com/'><img alt='Best Online Casino Guide in Australia' src='https://opencollective-production.s3.us-west-1.amazonaws.com/88bb6d20-900a-11ec-8a5a-a92310c15e5b.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Betting sites Australia' data-id='303335' href='https://hellsbet.com/en-au/'><img alt='Rating of best betting sites in Australia' src='https://opencollective-production.s3.us-west-1.amazonaws.com/aeb99e10-d1ec-11ec-88be-f9a15ca9f6f8.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='inkedin' data-id='305884' href='https://inkedin.com/free-spins-no-deposit/'><img alt='null' src='https://logo.clearbit.com/inkedin.com' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='New Casinos Australia' data-id='318011' href='https://www.newcasinosaustralia.com/'><img alt='null' src='https://logo.clearbit.com/newcasinosaustralia.com' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='AU Online Pokies' data-id='318650' href='https://www.australiaonlinepokies.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/b5779d90-221b-11ed-b874-23b20736a51e.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='CasinoAus' data-id='318653' href='https://www.casinoaus.net/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/e4943b80-2219-11ed-b874-23b20736a51e.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='AU Online Casinos' data-id='318656' href='https://www.australiaonlinecasinosites.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/f3aa3b60-2219-11ed-b2b0-83767ea0d654.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Top Australian Gambling' data-id='318659' href='https://www.topaustraliangambling.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/d7687f70-2219-11ed-a0b5-97427086b4aa.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Internet Pokies' data-id='318660' href='https://www.internetpokies.org/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/b3792060-2219-11ed-a0b5-97427086b4aa.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casinostranieri.net' data-id='319480' href='https://casinostranieri.net/'><img alt='' src='https://opencollective-production.s3.us-west-1.amazonaws.com/7aae8900-0c02-11ed-9aa8-2bd811fd6f10.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Goread.io' data-id='320564' href='https://goread.io/buy-instagram-followers'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/7d1302a0-0f33-11ed-a094-3dca78aec7cd.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='SureBet' data-id='321121' href='https://www.sure.bet/casinos-not-on-gamstop/'><img alt='We are the most advanced casino guide!' src='https://logo.clearbit.com/sure.bet' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Scommetteronline.info' data-id='321538' href='https://scommetteronline.info/bonus-scommesse-online/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/5536b3d0-17f8-11ed-98eb-57cc2820dbee.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Correct Casinos Australia' data-id='322445' href='https://www.correctcasinos.com/australian-online-casinos/'><img alt='Best Australian online casinos. Reviewed by Correct Casinos.' src='https://opencollective-production.s3.us-west-1.amazonaws.com/fef95200-1551-11ed-ba3f-410c614877c8.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='null' data-id='Empire Srls (double)' href='https://casinosicuri.info/'><img alt='casino online sicuri' src='https://user-images.githubusercontent.com/13700/183862257-d13855b6-68ad-4c06-a474-af1d6efcc430.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Ilcasinoitaliano' data-id='326857' href='https://ilcasinoitaliano.eu/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/3b057540-12fe-11ed-b410-97951f343249.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Casino utan svensk licens' data-id='326858' href='https://casinoburst.com/casino-utan-licens/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/ac61d790-1d3c-11ed-b8db-7b79b65b0dbb.PNG' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Vedonlyontibonukset.com' data-id='326863' href='https://www.vedonlyontibonukset.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/276ec220-df06-11eb-a5cf-7b18267f7c27.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='spinsify.com/uk' data-id='326864' href='https://www.spinsify.com/uk/new-casinos'><img alt='' src='https://opencollective-production.s3.us-west-1.amazonaws.com/2bacf2f0-df04-11eb-a5cf-7b18267f7c27.PNG' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='uudetkasinot.com' data-id='326865' href='https://www.uudetkasinot.com'><img alt='' src='https://opencollective-production.s3.us-west-1.amazonaws.com/b6055950-df00-11eb-9caa-b58f40adecd5.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Gem M' data-id='327241' href='https://www.noneedtostudy.com/take-my-online-class/'><img alt='null' src='https://user-images.githubusercontent.com/13700/187039696-e2d8cd59-8b4e-438f-a052-69095212427d.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Best Slots World' data-id='329117' href='https://bestslotsworld.com/'><img alt='Best Online Casinos' src='https://logo.clearbit.com/bestslotsworld.com' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='Slotmachineweb.com' data-id='329195' href='https://www.slotmachineweb.com/'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/172f9eb0-22c2-11ed-a0b5-97427086b4aa.jpg' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
<a title='likewave' data-id='334265' href='https://likewave.io/buy-instagram-likes'><img alt='null' src='https://opencollective-production.s3.us-west-1.amazonaws.com/ec927700-359e-11ed-97d0-014826afdf06.png' style='object-fit: contain; float: left; margin:12px' height='120' width='120'></a>
</div>

# License

MIT [http://rem.mit-license.org](http://rem.mit-license.org)
