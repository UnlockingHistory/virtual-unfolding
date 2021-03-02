// Gets data for greyscale (raw) texture map.
#import "src/common/gpu/utils.cl"

__kernel void tomLookup(
	__global __write_only uchar *image,
	__global __read_only uchar *rawData3D,
	__global __read_only int *rawData3DSize,
    __global __read_only float *positions3D,
	__global __read_only float *barycentrics,
	__global __read_only int *triangles2D,
	__global __read_only float *meshNormals,
	const int gridSizeX,
	const float zOffset
) {
    const size_t i =  get_global_id(0);

	// Calc image position.
    const int imageWidth = gridSizeX * TEXTURING_SCALE;
    const int2 imagePosition2D = { i % imageWidth, i / imageWidth };

    // Calc grid index.
    const int2 gridIndex2D = imagePosition2D / TEXTURING_SCALE;
    const int gridIndex = gridIndex2D.y * gridSizeX + gridIndex2D.x;

    const int3 triangle = {triangles2D[3*gridIndex], triangles2D[3*gridIndex + 1], triangles2D[3*gridIndex + 2]};
    if (triangle.x == NULL_INT32) {
        return;
    }
    const float3 barycentric = {barycentrics[3*i], barycentrics[3*i + 1], barycentrics[3*i + 2]};

    // Calc 3D position from 3D mesh.
    const float3 p1_3D = {positions3D[3*triangle.x], positions3D[3*triangle.x + 1], positions3D[3*triangle.x + 2]};
    const float3 p2_3D = {positions3D[3*triangle.y], positions3D[3*triangle.y + 1], positions3D[3*triangle.y + 2]};
    const float3 p3_3D = {positions3D[3*triangle.z], positions3D[3*triangle.z + 1], positions3D[3*triangle.z + 2]};
    float3 position3D = interpVectorBarycentric(barycentric, p1_3D, p2_3D, p3_3D);
    if (zOffset != 0) {
        // Get normals for each point
        const float3 p1_normal = {meshNormals[3*triangle.x], meshNormals[3*triangle.x + 1], meshNormals[3*triangle.x + 2]};
        const float3 p2_normal = {meshNormals[3*triangle.y], meshNormals[3*triangle.y + 1], meshNormals[3*triangle.y + 2]};
        const float3 p3_normal = {meshNormals[3*triangle.z], meshNormals[3*triangle.z + 1], meshNormals[3*triangle.z + 2]};
        const float3 normal = interpVectorBarycentric(barycentric, p1_normal, p2_normal, p3_normal);
        position3D += normal * zOffset;
    }

    // Trilinear interpolation.
    image[i] = trilinearInterpolation_uchar(position3D, rawData3D, rawData3DSize);
}
