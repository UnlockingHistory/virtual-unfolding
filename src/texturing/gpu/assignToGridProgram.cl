// Assigns all flattened mesh points to grid.

__kernel void assignToGrid(
	__global __write_only int *grid2D,
	__global __read_only float *positions2D,
    __global __read_only int *meshNumbers,
	const int offsetX,
	const int offsetY,
	const int gridSizeX,
	const int currentMeshNum
) {
    const size_t i =  get_global_id(0);

    // Ignore if this point is not part of the current mesh.
    if (meshNumbers[i] != currentMeshNum) {
        return;
    }

    const float2 position2D  = {positions2D[2*i], positions2D[2*i+1]};

    // Ignore if this point has not been mapped to 2D.
    if (position2D.x == NULL_FLOAT32) {
        return;
    }

    // Convert to index.
	const float2 offset = {offsetX, offsetY};
    const int2 index2D = convert_int2(floor(position2D - offset));

    // Put point on grid.
	// Note: it's possible that another vertex in this same pixel is overwritten here, but that's ok.
	// The purpose of this is to efficiently find nearby vertices to get a reasonable px value.
    grid2D[index2D.y * gridSizeX + index2D.x] = i;
}