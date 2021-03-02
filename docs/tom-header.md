# tom header

The TOM file format is used by the MuCAT series of XMT scanners at QMUL. Tom files contain a 512 byte header as specified in the [tomheader.h file](https://github.com/g7uvw/TomHeader/blob/main/tomheader.h). The TOM format is supported by Drishti (https://github.com/nci/drishti) and TomView (http://qmxmt.com/scans/Tomview/).  We will be releasing a web-based viewer soon as well.

We have adapted the tom format a bit to fit our needs and store other data types (float32, int32) and high dimensional data (e.g. 3D arrays of vectors).  More details about these changes can be found in [/src/common/io.ts](/src/common/io.ts).

Here are the important points:

- The total lengths of the header is 512 bytes.
- The 3D data stored in the tom file is ordered in groups of z layers.  Within each z layer the data is ordered in groups of y rows.
- The first three 16bit words of the header (xsize, ysize, zsize) specify the X, Y and Z dimensions of the 3D volume contained in the file.  These are stored as Int16LE.

In the spaces of the header that are normally reserved for comments we have added the following:

- At 320 bytes into the header we have reserved 10 bytes to store the data type of the tom file as a string.  Currently, these might be: 'uint8', 'int32', 'uint32', or 'float32'.  If no valid data type is found, we assume the tom is of type 'uint8'.
- At 330 bytes into the header we have reserved 6 bytes to store the number of elements represented by each voxel in the tom file.  The first 5 bytes are occupied by a marker, the string 'NumEl', and the next byte is the number of elements.  If the 'NumEl' marker is not found, the number of elements is assumed to be 1.  For tom files containing a 3D vector in each voxel, we set the number of elements to 3 and store the x, y, and z components of each vector sequentially in the tom file.
- At 336 bytes into the header we have reserved 5 bytes to store whether the data contains null values.  The first 4 bytes are occupied by a marker, the string 'Null', and the next byte is a one or zero.  If the 'Null' marker is not found, the file is assumed to not contain null elements.  (Future work: We should store the null value in the header as well for backwards compatibility.)