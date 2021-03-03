# Virtual Unfolding

<img src="unfold.gif" />

This codebase for the "virtual unfolding" computational pipeline described in the article: [“Unlocking history through automated virtual unfolding of sealed documents imaged by X-ray microtomography."](https://www.nature.com/articles/s41467-021-21326-w)

This code was written by [Amanda Ghassaei](http://amandaghassaei.com/) and [Holly Jackson](http://holly-jackson.com/) and supervised by [Erik Demaine](https://erikdemaine.org/).  This work was done in collaboration with the Unlocking History team: [Jana Dambrogio](http://www.janadambrogio.com/), [Daniel Starza Smith](https://www.kcl.ac.uk/people/dr-daniel-starza-smith), [Martin Demaine](http://martindemaine.org/), [Graham Davis](https://www.qmul.ac.uk/dentistry/people/profiles/grahamdavis.html), [David Mills](http://webshed.org/wiki/About_Me), [Rebekah Ahrendt](https://uu.academia.edu/RebekahAhrendt), [Nadine Akkerman](https://nadineakkerman.com/), [David van der Linden](https://www.dcvanderlinden.com/), and [many others](http://letterlocking.org/team).

**NOTICE** In this repo, we are still in the process of optimizing and cleaning up the original code used in the article so that it can be more easily used and modified. In addition, we have fixed a few bugs and improved performance significantly.  Most of this work has been completed, but we are still in the process of debugging the "segmentation" and "flattening" parts and porting over the "hybrid mesh propagation" step described in the article.  Please bear with us, we do hope to have this last bit complete in the next few weeks.  You can find an archived version of the code that was used in our original paper at [https://doi.org/10.7910/DVN/VBWOI6](https://doi.org/10.7910/DVN/VBWOI6).  You can track our progress on the last few pieces of the refactor at [https://github.com/UnlockingHistory/virtual-unfolding/projects/1](https://github.com/UnlockingHistory/virtual-unfolding/projects/1).


## Installation

### Install node

Install node.js either using [the node.js installer](https://nodejs.org/en/download/) or through your package manager of choice.  Currently we recommend installing version `8.16.2` (see note below).

One of the dependencies of this codebase (`node-opencl`) must be compiled against the version of node on your machine.
We were not able to compile this package using the most recent node builds (specifically `node v14.2.8` and `node v11.9.0`), so we are currently using `node v8.16.2` and `node v8.10.0`.  We are using [nvm](https://github.com/nvm-sh/nvm) to manage various node version on our machine.
It's possible that a later version of node will work (maybe `v9` or `v10`), but this has not been tested.

### Install node-gyp dependencies

Use of node-gyp requires some extra steps (see [node-gyp installation instructions](https://github.com/nodejs/node-gyp#installation) for more information).

In theory node-gyp should work with [several versions of python](https://github.com/nodejs/node-gyp#configuring-python-dependency), but this particular installation seems to require python 2.  If you have multiple versions of python installed on your machine you can configure node-gyp to use python 2 by:

```
npm config set python /path/to/executable/python2
```

We are currently running this code with `python v2.7`.

### Get the code

Clone this repo, then cd into the `virtual-unfolding` directory.


### Install other dependencies

Finally, install all dependencies:

```
npm install
```

If you see any errors during this installation, please read through the installation notes above carefully.
Compilation of the node-opencl library with node-gyp is quite finicky at the moment, it will throw many warnings – that's ok.

## Usage

To test the full pipeline run:
```
npm start
```

This will process a small file and place all intermediate files and final results in `output/FILENAME/`.  A full description of all output files is given in [docs/output-files.md](/docs/output-files.md).  If you plan to process very large files with this codebase, the intention here was that this could be run on a GPU using openCL.  Depending on the size of your XMT data, you may need a GPU with significant RAM - we are currently processing our files on 1/2 of an NVIDIA Titan X.

### Command Line Arguments

You can see a list of default parameters passed to the script in `src/common/Defaults.ts`.
To bypass these defaults, pass optional environment variables:
```
DEVICE_NUM=1 npm start
```

The full list of valid command line arguments is given in [Default.ts](https://github.com/UnlockingHistory/virtual-unfolding/blob/main/src/common/Defaults.ts).  

### Visualizations

This repo also includes some scripts for generating animations and other visualizations of the tomography data and results.  See the [visualization README](https://github.com/UnlockingHistory/virtual-unfolding/tree/main/docs/visualization.md) for more information and find our blender rendering setups [here](https://github.com/UnlockingHistory/blender-setups).


## Contributing

We hope that this code will continue to evolve over time to be more efficient and robust, and we welcome contributions.  We would also love to hear about how you are using this code.

Some specific contributions that we are interested in:

- **Compatibility with a wider variety of volumetric 3d data formats** - Currently we support the .tom file format, explained here [NEED SOURCE].  If you have volumetric data in other formats, please reach out to us and we can figure out a way to get your data to work with this pipeline.

- **Global mappings from R3 -> R2** - We currently use an incremental scheme to map connected components identified by segmentation to a 2D plane.  Because our datasets have so far been limited to artifacts with little warping of the writing substrate, we do not have to introduce much distortion into the mesh to compute this mapping, and our incremental approach is usually sufficient.  Many historical artifacts are warped due to excessive heating, water damage, or other processes of time and may fail to map properly to 2D in our current scheme.

- **Improving Speed** - Because of the large size of the volumetric scans expected by this codebase, it is often not possible to load all relevant data for a given step in cpu/gpu ram.  To deal with this, the pipeline depends heavily on buffering in partial data from disk (BufferedTomData).  Currently the segmentation steps (especially NormalsRelaxation) are severely limited by time to read/write to disk.  These read/write calls are all synchronous and performance could be improved by using asynchronous calls.

### More Information

Some coding conventions we've been trying to enforce:

- We don't use a lot of the built in JS iterator-type functions (forEach, map, reduce, filter, etc), esp in code that is part of a processing-heavy loop dealing with very large arrays.  Though these methods are really nice, they force you to create new contexts on each iteration which eventually need to get cleaned up by the garbage collector.  We've found that this garbage collection can actually take a quite significant amount of time if a lot of these contexts are inited.
- We try not to init arrays or objects while processing a large array of data.  In a lot of methods on e.g. MutableTypedArray we require that you pass in an array if many values need to be written and returned.  This is for the same garbage collection reasons as above.  As a result, you do have to be a bit careful about keeping track of potential mutations in your arrays/objects.
