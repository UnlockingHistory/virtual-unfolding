#import "src/common/gpu/utils.cl"

static float getValFromIndex3D_NearestBoundary(const int3 index3D, __global __read_only float *data, __global __read_only int *size, const int dataOffset) {
	// Get nearest index on boundary.
	int x = index3D.x;
	int y = index3D.y;
	int z = index3D.z;
    if (x < 0) {
        x = 0;
    }
    if (y < 0) {
        y = 0;
    }
    if (z < 0) {
        z = 0;
    }
    if (x >= size[0]) {
        x = size[0] - 1;
    }
    if (y >= size[1]) {
        y = size[1] - 1;
    }
    if (z >= size[2]) {
        z = size[2] - 1;
    }
    return data[z * size[0] * size[1] + y * size[0] + x - dataOffset];
}

__kernel void convolve1D(
	__global __read_only float *input,
	__global __write_only float *output,
    __global __read_only int *size,
	__global __read_only float *convolutionKernel,
	const int kernelSize,
	const int axis,
    const int z,
    const int inputOffset
) {
    const size_t i =  get_global_id(0);
    int3 index3D = calcIndex3DFromIndex1D(i, size);
    index3D.z = z;

    // Compute axis vector for computing convolution.
    int3 offsetVector = { 0, 0, 0 };
    // offsetVector[axis] = 1;
    if (axis == 0) {
        offsetVector.x = 1;
    } else if (axis == 1) {
        offsetVector.y = 1;
    } else {
        offsetVector.z = 1;
    }

    // Compute convolution.
    float convolution = convolutionKernel[kernelSize] * input[index3D.z * size[0] * size[1] + index3D.y * size[0] + index3D.x - inputOffset];
    for (int j = 1; j <= kernelSize; j++) {
        convolution += convolutionKernel[kernelSize + j]
			* getValFromIndex3D_NearestBoundary(index3D + offsetVector * j, input, size, inputOffset);
        convolution += convolutionKernel[kernelSize - j]
			* getValFromIndex3D_NearestBoundary(index3D - offsetVector * j, input, size, inputOffset);
    }

    output[i] = convolution;
}