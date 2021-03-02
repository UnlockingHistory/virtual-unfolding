#import "src/common/gpu/utils.cl"

__kernel void pointsGeneration(
	__global __write_only float *points,
    __global __read_only float *data,
	__global __read_only float *normals,
	__global __read_only int *size,
    __global __read_only float *firstDerivKernel,
	__global __read_only float *secondDerivKernel,
    const int zOffset
) {
    const size_t i =  get_global_id(0);
    const int i_global = i + zOffset * size[0] * size[1];

    // Set default outputs.
    points[3*i] = NULL_FLOAT32;
    points[3*i + 1] = NULL_FLOAT32;
    points[3*i + 2] = NULL_FLOAT32;

    const float3 normal = { normals[3 * i], normals[3 * i + 1], normals[3 * i + 2] };
    const int3 index3D = calcIndex3DFromIndex1D(i_global, size);
    const float3 position = calcPosition3DFromIndex3D(index3D);

    // Check that voxel meets criteria for pt generation.
    const float voxelVal = getValFromIndex3D_ZeroBoundary(index3D, data, size);
    if (voxelVal < NOISE_THRESHOLD) {
        return;
    }

    // Extract oriented strip of ct data, and use it to calc first and second derivs.
    float firstDeriv = 0;
    float secondDeriv = 0;
    for (int j = -KERNEL_DIM; j <= KERNEL_DIM; j++) {
        const float3 offsetPosition = position + j * normal;
        const float val = trilinearInterpolation(offsetPosition, data, size);
        firstDeriv += val * firstDerivKernel[KERNEL_DIM + j];
        secondDeriv += val * secondDerivKernel[KERNEL_DIM + j];
    }

    // Check that response meets criteria for pt generation.
    if (secondDeriv > 0) {
        return;
    }

    // Calc offset of ridge from center of voxel.
    const float t = -firstDeriv / secondDeriv;
    const float3 offset = normal * t;

    // Check that point is in voxel.
    const float range = 0.6f;
    if (fabs(offset.x) > range || fabs(offset.y) > range || fabs(offset.z) > range) {
        return;
    }

    // Absolute position of point.
    const float3 point = position + offset;

    points[3 * i] = point.x;
    points[3 * i + 1] = point.y;
    points[3 * i + 2] = point.z;
}