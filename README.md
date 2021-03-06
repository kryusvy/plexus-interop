# Plexus Interop [![Symphony Software Foundation - Incubating](https://cdn.rawgit.com/symphonyoss/contrib-toolbox/master/images/ssf-badge-incubating.svg)](https://symphonyoss.atlassian.net/wiki/display/FM/Incubating)

## Overview

**Plexus Interop** is metadata-centric language-agnostic desktop app-to-app interoperability framework with extensible model for launching new instances of desktop Apps on demand.
 
The main goal of the framework is to enable development of extensible workflows connecting independent Apps developed in different technologies (.NET, Web, Java, Python etc) and passing context (structured data objects) between them.

Framework architecture is based around central broker providing hub-and-spoke connectivity between Apps and brokering strongly typed RPC-style calls between them. Broker has a connection to Application Lifecycle Manager which is capable of creating new instances of the Apps based on the their runtime-metadata (e.g. container type, launch command, params etc) defined in a registry.

Plexus Interop separates interoperability from the container, which provides notable advantages: different containers can be leveraged in the same workflow, launched applications residing outside of containers can participate in interop activities.

![Key components and high level architecture](./docs/src/main/asciidoc/images/architecture.png "Key components and high level architecture")

## Raising an Issue
* Please raise issues to the project mailing list <plexus-interop@symphony.foundation> issue tracker. Some people from project teams currently can't access build-in github issue tracker from corporate network.
* Please also tag the new issue with either "Bug" or "Enhancement".
 
## Repository Overview

Plexus Interop repository consist of the following main sections:
* *desktop* - Interop Broker, .NET Interop Client and sample apps implemented in C# using [.NET Core 2.0](https://www.microsoft.com/net/download/core).
* *web* - Web Interop Client and sample apps implemented in [TypeScript](https://www.typescriptlang.org/).
* *dsl* - [Protobuf](https://developers.google.com/protocol-buffers/) and Plexus Interop grammar parsers, validators and code-generators implemented using [Xtext framework](https://eclipse.org/Xtext/).
* *docs* - documentation implemented in [AsciiDoc](http://asciidoc.org/) format using [Asciidoctor](http://asciidoctor.org/) processor.
* *protocol* - definitions of Plexus Interop protocol messages in [Protobuf](https://developers.google.com/protocol-buffers/) format.
* *samples* - sample interop metadata. 

Build and samples are currently tested on Windows environments; building and running on Linux/OSX environments is still experimental (see below).

## Build/Install

Make sure that Java SDK is installed and [JAVA_HOME variable is set](https://www.mkyong.com/java/how-to-set-java_home-on-windows-10/).

All Plexus Interop components can be built using [Gradle](https://gradle.org/) tool using the following single command:

`./gradlew build --console plain`

Build produces artifacts into folder "bin"; the first run can take 10 minutes or more, depending on your Internet connection speed.

### Using OSX

If running on OSX, please update `desktop/src/Plexus.Interop.sln` file and remove any code block that starts with `ProjectSection(ProjectDependencies)` and ends with `EndSection`; if you have already executed the `gradlew` build once, you must cleanup your local checkout using `git clean -d -f -X` (add `-n` for a dry run).

## Running Samples

After successful build samples binaries will be located in `bin` directory.

Run .Net to Web interop example on Windows:

- Go to `bin/win-x86/samples/greeting` (or `bin/osx-x64/samples/greeting` for OSX/Linux)
- Launch Broker – `LaunchBroker.cmd` (or `LaunchBroker.sh` for OSX/Linux)
- Launch (from a different terminal) Greeting Client – LaunchGreetingClient.cmd
    - Choose “Discovery” option (5) and “Greeting from Electron Web app” from discovery response

    ![Sample-1](./docs/src/main/asciidoc/images/sample-1.png "Sample-1")
    - Enter name, e.g. “John” and hit enter – Web Greeting Server app will be launched by Broker, print Greeting Request:

    ![Sample-2](./docs/src/main/asciidoc/images/sample-2.png "Sample-2")
    - And send response back to .Net Greeting Client

    ![Sample-3](./docs/src/main/asciidoc/images/sample-3.png "Sample-3")

    - Then choose Discovery (5) and “Greeting from .Net app” from discovery response
    - Enter another name, e.g. “Mike” and hit enter - .Net Greeting Server app will be launched and print greeting request:

    ![Sample-4](./docs/src/main/asciidoc/images/sample-4.png "Sample-4")


## Documentation

To check out docs, visit [https://symphonyoss.github.io/plexus-interop/](https://symphonyoss.github.io/plexus-interop/).

Documentation project is located in folder 'docs'. We build documentation using [AsciiDoc](http://asciidoc.org/).

To render diagrams during the build you need to have [graphviz](http://www.graphviz.org) installed on the machine.

Invoke the following command to run the documentation build:

`gradlew -p docs --console plain`

After successful build documentation is available via:

`bin/docs/html5/index.html`

## Contributing

Please refer to [Contribution guidelines for this project](CONTRIBUTING.md).

## Troubleshooting

Problem: Gradle fails to download dependencies, how to setup proxy configuration?

Solution: Pass proxy settings into Gradle via command-line parameters - e.g. `gradlew.bat -Dhttp.proxyHost=myproxy.com -Dhttp.proxyPort=8888 -Dhttps.proxyHost=myproxy.com -D https.proxyPort=4444 ...`

## Updating public documentation

As described above, public documentation is served using [GitHub Pages](https://help.github.com/articles/what-is-github-pages) and stored in `gh-pages` branch. So to update it, you simply need to push updated documentation to this branch. `gh-pages` branch structure is different from `master`, so manual update requires few steps:

* Clone (if haven't cloned it yet) repository to `plexus-interop` folder
* Clone another copy of repository to separate `plexus-interop-docs` folder, checkout `gh-pages` branch there
* Create branch for documentation update, e.g. `git checkout -b feature/gh-pages-update`
* Return back to folder with main line branch, build documentation `gradlew build -p docs --console plain`
* Copy documentation sources - `plexus-interop/docs` to `plexus-interop-docs/docs`
* Copy generated documentation - `plexus-interop/bin/html5` to `plexus-interop-docs` (project root)
* Go to `plexus-interop-docs`, push the changes and raise PR against `gh-pages` branch