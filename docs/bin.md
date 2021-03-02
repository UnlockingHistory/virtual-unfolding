# bin file format

The BIN file format is a simple format for storing 1D arrays. Bin files contain a 100 byte header with some info about the data contained within them.  Details about these bin format can be found in [/src/common/io.ts](/src/common/io.ts).

Here are the important points:

- The total length of the header is 100 bytes.

In the header we have added the following:

- At 4 bytes into the header we have reserved 10 bytes to store the data type of the bin file as a string.  Currently, these might be: 'uint8', 'int32', 'uint32', or 'float32'.
- At 14 bytes into the header we have reserved 6 bytes to store the number of elements represented by each voxel in the bin file.  The first 5 bytes are occupied by a marker, the string 'NumEl', and the next byte is the number of elements.  For bin files containing an array of 3D vectors, we set the number of elements to 3 and store the x, y, and z components of each vector sequentially in the bin file.
- At 20 bytes into the header we have reserved 5 bytes to store whether the data contains null values.  The first 4 bytes are occupied by a marker, the string 'Null', and the next byte is a one or zero.  (Future work: We should store the null value in the header as well for backwards compatibility.)