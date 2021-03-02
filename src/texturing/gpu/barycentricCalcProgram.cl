// Calcs barycentric coordinates for each pixel.
#import "src/common/gpu/utils.cl"

__kernel void barycentricCalc(
	__global __write_only float *barycentrics, 
	__global __read_only float *positions2D,
    __global __read_only int *triangles2D,
	const int offsetX,
	const int offsetY,
	const int gridSizeX
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

    // Calc barycentric coordinates using full resolution.
    const float2 gridOffset = {offsetX, offsetY};
    const float2 gridSubPixelPosition2D = gridOffset + (convert_float2(imagePosition2D) + 0.5f) / convert_float(TEXTURING_SCALE);

    // Calc barycentric coordinates from 2D mesh.
    const float2 p1_2D = {positions2D[2*triangle.x], positions2D[2*triangle.x + 1]};
    const float2 p2_2D = {positions2D[2*triangle.y], positions2D[2*triangle.y + 1]};
    const float2 p3_2D = {positions2D[2*triangle.z], positions2D[2*triangle.z + 1]};
    const float3 barycentric = calcBarycentricCoords(gridSubPixelPosition2D, p1_2D, p2_2D, p3_2D);

    // Save coordinates.
    barycentrics[3 * i] = barycentric.x;
    barycentrics[3 * i + 1] = barycentric.y;
    barycentrics[3 * i + 2] = barycentric.z;
}
