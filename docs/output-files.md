# Virtual Unfolding: Output Files

This document describes the intermediate files and final results that are output from the virtual unfolding pipeline currently.  We are using two different file formats to store large arrays of intermediate data in this pipeline:

- .tom files represent 3D data.  We are loosely basing this file-structure off the original tom data format (more info [here](/docs/tom.md)), but we have extended it to be able to store many different type of data beyond uint8 (int32, float32) and have also added the ability to store high dimensional data (e.g. a 3D vector of float32 for each voxel).  These extra abilities are marked by some custom header markers, which we check for in the BufferedTomData classes (found in [/src/common/](/src/common/)).
- .bin files represent 1D data.  Once we have computed a set of points and created a mesh from the 3D tomography data, it is useful (from a space-management perspective) to store 1D lists of indexed data, since most voxels in a given scan will contain air.  These files can also represent many data types (uint8, float32, int32) and can have grouped high-dimensional data (e.g. 3D vectors).

Assuming we are processing a file called FILENAME.tom, by default the script `npm start` will look for this file in the `data/` folder.
Then it will create a folder at `output/FILENAME` and create the following files:

### Segmentation

- `FILENAME_raw.tom` - This is a copy of the original data, converted into a float32 format.
- `FILENAME_clipped.tom` - This is a copy of the original data, clipped to SegmentationParams.CLIP_VAL and converted to float32 format.
- `FILENAME_G**.tom` and `FILENAME_G**_3X.tom` - These are spatial derivatives of the clipped data along the x/y/z axes.  The naming convention gives the orientation and degree of the derivative (GX is the first derivative along X, GXY is the first derivate along X and Y, GXX is the second derivate along X).  Derivatives are computed using a gaussian derivate kernel.  All other coordinate axes whose derivative is not calculated are blurred by a gaussian kernel.  The `sigma` parameter of the gaussian kernels is derived from SegmentationParams.EXPECTED_SINGLE_LAYER_WIDTH following the methods from [Steger's "An Unbiased Detector of Curvilinear Structures" (1998)](/docs/StegerUnbiasedDetector.pdf).  We also compute another set of derivatives with more blurring (set by SegmentationParams.NORMAL_RELAX_GAUSS_SCALE), these filenames have a `_3X` at the end to indicate the multiplier on the sigma parameter (default scale is 3).  All files are stored as float32.
- `FILENAME_normals.tom` - These are surface normal calculations of the raw data, stored as float32 values grouped into triplets for x, y, z coordinates.  Calculation of these normals is based on Steger 1998.
- `FILENAME_responses.tom` - These are response calculations along the direction of the surface normals, essentially giving an estimate of the second derivative along the normal vector.  Stored as float32.  Calculation of these responses is based on Steger 1998.
- `FILENAME_normalsRelaxed.tom` and `FILENAME_responsesRelaxed.tom` - The normals and responses we compute straight from the gaussian derivatives tend to be noisy, so we compute an iterative relaxation of these values to smooth them and make them more coherent with neighboring values.  The number of steps of normal relaxation is set by SegmentationParams.NUM_NORMAL_RELAXATION_STEPS.
- `FILENAME_blurred.tom` - We perform an oriented blurring of the raw data, to smooth out changes in paper density caused by ink or other anomalies.  This is a 2D blurring oriented in the plane defined by the relaxed surface normals.  These values are stored as float32.  The number of iterations is set by SegmentationParams.NUM_ORIENTED_BLUR_STEPS and the degree of gaussian blurring is set by SegmentationParams.ORIENTED_BLUR_SIGMA.
- `FILENAME_allPoints.tom` - This file contains the coordinates of a single point detected within each voxel, based on the methods described by Steger 1998. Values stored as float32, grouped into triplets for x, y, z coordinates.  If no point is present, we fill this voxel with a null value.  SegmentationParams.NOISE_THRESHOLD is used filter out computed points that are not located on the surface of the paper substrate. SegmentationParams.POINT_DETECTION_MERGE_TOL used to filter out points that are too close to each other in 3D space.
- `FILENAME_allIndices.tom` - This file assigns a sequential index to each point found in `FILENAME_allPoints.tom`.  Values are stored as int32 with a null value indicating no point present in the current voxel.
- `FILENAME_allWidthsMin.tom` and `FILENAME_allWidthsMax.tom` - These files contain estimates for the local paper width at each point in `FILENAME_allPoints.tom`.  `FILENAME_allWidthsMin.tom` gives the paper thickness extent in the direction of negative normal and `FILENAME_allWidthsMax.tom` gives the paper thickness extent in the direction of positive normal.  Values are stores as float32 will null value indicating no point present.
- `FILENAME_allPointsList.bin` - Same as `FILENAME_allPoints.tom`, but structured as a 1D list with all null values removed, rather than 3D volumetric data.  Values are float32, grouped in triplets for x, y, z, coordinates.
- `FILENAME_allNormalsList.bin` - Corresponding normals data from `FILENAME_normalsRelaxed.tom` for each point in `FILENAME_allPointsList.bin`.  Values are float32, grouped in triplets for x, y, z, coordinates.
- `FILENAME_points3DList.bin` and `FILENAME_points3DList_FLAGGED.bin` - We perform filtering of `FILENAME_allPointsList.bin` based on SegmentationParams.MAX_SINGLE_LAYER_WIDTH.  High quality points (passing test) are stored in `FILENAME_points3DList.bin`, and low quality points are stored in `FILENAME_points3DList_FLAGGED.bin`.  Values are float32, grouped in triplets for x, y, z, coordinates.
- `FILENAME_normalsList.bin` and `FILENAME_normalsList_FLAGGED.bin` -  Same filtering as above for normals data, values are float32, grouped in triplets for x, y, z, coordinates.
- `FILENAME_widthsMinList.bin`, `FILENAME_widthsMaxList.bin`, `FILENAME_widthsMinList_FLAGGED.bin`, and `FILENAME_widthsMaxList_FLAGGED.bin` -  Same filtering as above for widthsMin and widthsMax data, values are float32.
- `FILENAME_meshNeighborsList.bin` - After meshing points in `FILENAME_points3DList.bin` based on criteria SegmentationParams.MESHING_NORMAL_ALIGNMENT_TOL, SegmentationParams.MESHING_EDGE_NORMAL_ORTHOG_TOL, SegmentationParams.MAX_EDGE_LENGTH, SegmentationParams.MESHING_MIN_ANGLE, and SegmentationParams.MIN_MESH_COMPONENT_SIZE, this array gives neighbor indices for each point in mesh.  A point's index is given by it's 1D position in `FILENAME_points3DList.bin`.  Stored as int32 in groups of length SegmentationParams.MAX_NUM_NEIGHBORS with null value indicating no neighbor.  Points not included in a mesh are moved to `FILENAME_points3DList_FLAGGED.bin`, along with their corresponding normals and widths.
- `FILENAME_meshNumbersList.bin` - After meshing, we compute a mesh number for each connected component detected, starting with Mesh 0.  Stored as int32 for each point in `FILENAME_points3DList.bin`.
- `FILENAME_indices.tom` and `FILENAME_indices_FLAGGED.tom` -  Finally we store the 1D index of each point in `FILENAME_points3DList.bin` and `FILENAME_points3DList_FLAGGED.bin` in a volumetric array.  Stored as int32 with a null value indicating no point present in current voxel.

### Flattening

- `FILENAME_points2DList.bin` - This is an array of 2D vectors giving the 2D positions of the points in `FILENAME_points3DList.bin` in the flat state.  Points that were not able to be mapped to 2D at this stage are set to null.
- `FILENAME_iterMappedList.bin` - This array contains the iteration number that the points were mapped to 2D.

### Propagation

This has not been refactored yet.

### Texturing

- `FILENAME_MeshXX.bmp` - An image of the flattened letter with the XMT mapped to 2D.  We generate a separate image for each connected component identified by virtual unfolding.
- `FILENAME_CP_MeshXX.bmp` - An image of the crease pattern of the flattened letter.  We generate a separate image for each connected component identified by virtual unfolding.
- `FILENAME_CP_inv_MeshXX.bmp` - An image of the crease pattern of the flattened letter with the red/blue colors reversed.  We generate a separate image for each connected component identified by virtual unfolding.