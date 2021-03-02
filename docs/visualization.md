# Virtual Unfolding: Visualization

This repo contains a number of scripts that create visualizations from the input and output data of virtual unfolding.  The following scripts are available:

## make_obj

This script creates a 3D model of the folded geometry (.obj) with uv coordinates applied so that you can visualize the texture map in its folded state.  Rather than using the vertices generated during virtual unfolding, this script generates a more regular grided mesh at a user-defined resolution.  This mesh can be used as an input to the [unfold_obj](#unfold_obj) script.  We also include controls to adjust the resolution of the mesh based on surface curvature and boundary regularity, reducing final file size of resulting obj.

![multiresolution obj 3d model](/docs/imgs/multires_obj.png)

```sh
npm run make_obj
```

`FILENAME: string` - filename (without extension) of .tom data and corresponding processed files, default is `DB-1538_58x58x58`.  
`OUTPUT_PATH: string` - path to output folder, default is `output/`.  
`SCALE: int` - scale factor for reducing obj resolution, default is `1`. We have run into some memory limitations in our unfolding animation script, so we generally set this scale factor to some number > 1 to reduce the file size.
`SCALE_FINE: int` - scale factor for reducing obj resolution, this factor is used on regions of high curvature or irregular boundaries, default is `1`. In order to preserve higher resolution around areas of high curvature we added this additional scaling factor.  Just make sure that `SCALE` is an integer multiple of `SCALE_FINE`.
`MESH_NUM: int` - the mesh number associated with the mesh component to export, default is `0`.  Virtual unfolding may produce many separate, unconnected meshes, this parameter specifies which mesh to convert to obj.

When using these args, please put them in front of the `npm run` command:
```sh
FILENAME=mytomfile SCALE=3 npm run make_obj
```

You can view OBJs by uploading the obj, mtl, and bmp file to [https://3dviewer.net/](https://3dviewer.net/).  By default the OBJ's material file will point to `{FILENAME}_Mesh{MESH_NUM}.bmp`.  In order to get proper alignment of the texture to the OBJ's uv coordinates, render the texture with 0 padding.  To edit the image displayed on the mesh, modify the OBJ file directly.  Open the file in a text editor and search for the line:

```
newmtl Material 1
```
Below that you will see:
```
map_Kd FILENAME.png
```

Edit the image specified and put your new texture image in the same folder as the obj file.


## unfold_obj

This script unfolds an obj using a physics simulation so that all dihedral angles are 0 (flat).  This process occurs over a number of iterations, which can be chained together to form an animation.

![unfolding animation of letterpacket](/docs/imgs/unfoldinganimation-fwdrev.gif)

More details about setting up this animation in a blender scene for rendering is given [here](https://github.com/UnlockingHistory/blender-setups).  You must first run [make_obj](#make_obj) for this script to work.

```sh
npm run unfold_obj
```

`FILENAME: string` - filename (without extension) of .tom data and corresponding processed files, default is `DB-1538_58x58x58`.  
`OUTPUT_PATH: string` - path to output folder, default is `output/`.  
`NUM_ITERS: int` - numbers of iterations to run solver, default is `100`.
`STEP_SCALE: float` - scaling factor for each step of the simulation, default is `0.05`.  Increasing `STEP_SCALE` will cause the mesh to move more at each step of the simulation, reaching the solution faster, but it may result in some instabilities if too high.
`MESH_NUM: int` - the mesh number associated with the mesh component to export, default is `0`.  Virtual unfolding may produce many separate, unconnected meshes, this parameter specifies which mesh to unfold.

When using these args, please put them in front of the `npm run` command:
```sh
FILENAME=myfile NUM_ITERS=10 npm run unfold_obj
```

There is currently a memory limitation in the matrix solver library we are using, so above 2GB of RAM usage may throw an error:  

`
Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value 2013265920, (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0`

For now we are lowering the resolution of the OBJ (using the `SCALE` and `SCALE_FINE` arguments of [make_obj](#make_obj)) to deal with this, but there is probably a better long-term solution.  Note that (we think) there are also some array length limitations with emscripten/nodejs preventing us from allocating more space.  For now, we've found that you have to keep the size of the OBJ under ~26Mb for it to work.

This process will produce two files:
- an OBJ (yourfilename_unfolded.obj) of the final shape of the mesh after simulation
- a file (yourfilename_UnfoldingAnimation.bin) containing all the intermediate simulation steps, which can be used to generate an animation in Blender following [these steps](https://github.com/UnlockingHistory/blender-setups#unfoldinganimationblend).


## tom_to_raw

This script converts a .tom file containing volumetric data from a CT scan into the .raw format required to import it into Blender.  Once in Blender, you can make a volumetric rendering of the raw data using [this template](https://github.com/UnlockingHistory/blender-setups#volumetricrenderingblend).

```sh
npm run tom_to_raw
```

`FILENAME: string` - filename (without extension) of .tom data, default is `DB-1538_58x58x58`.  
`DATA_PATH: string` - path to input .tom data, default is `data/`.  
`OUTPUT_PATH: string` - path to output folder, default is `output/`.  
`SCALE: int` - scale factor for reducing data size, default is `1`.  

When using these args, please put them in front of the `npm run` command:
```sh
FILENAME=mytomfile SCALE=3 npm run tom_to_raw
```


## xray_vol_data

This script takes a TOM file and flattens its pixel values with some transparency along a given axis to create 2D image.

![xray view of sample .tom file](/docs/imgs/DB-1538_1557x248x2591_xray_Y.jpg)

```sh
npm run xray_vol_data
```

Available command line options:

`DEVICE_NUM: int` - OPEN_CL device number to target, default is `0`.  
`FILENAME: string` - filename (without extension) of .tom data, default is `DB-1538_58x58x58`.  
`DATA_PATH: string` - path to input .tom data, default is `data/`.  
`OUTPUT_PATH: string` - path to output folder, default is `output/`.  
`OPACITY: float` - opacity to use for blending, default is `0.05`.  
`AXIS: x | y | z` - direction to flatten data, default is `y`.  

When using these args, please put them in front of the `npm run` command:
```sh
OPACITY=0.1 AXIS=z npm run xray_vol_data
```

Future work: we should extend this to accept other CT file formats.


## flythrough_animation

This Python3 script creates a flythrough animation (.mp4) of the volumetric data, along the z axis.

![flythrough of XMT scan of 10 locked letters](/docs/imgs/10letters_flythrough.gif)

```sh
npm run flythrough_animation
```

**Currently we have all info hardcoded in this python file, but we will be fixing this very soon to the following:**

Available command line options:

`DEVICE_NUM: int` - OPEN_CL device number to target, default is `0`.  
`FILENAME: string` - filename (without extension) of .tom data, default is `DB-1538_58x58x58`.  
`DATA_PATH: string` - path to input .tom data, default is `data/`.  
`OUTPUT_PATH: string` - path to output folder, default is `output/`.  
`FPS: int` - framerate of animation, default is `30`.  

When using these args, please put them in front of the `npm run` command:
```sh
FPS=24 AXIS=z npm run flythrough_animation
```

Future work: we should extend this to accept other CT file formats and produce animations along other axes.
