// Selectively flip meshNormals so they are aligned in 2D.

__kernel void flipMeshNormals(
	__global __read_only float *meshNormals2D,
	__global __read_write float *meshNormals
) {
    const size_t i =  get_global_id(0);

	const float dir = meshNormals2D[3 * i + 2];

	// Check for null.
	if (dir == NULL_FLOAT32) {
		return;
	}

	// Flip normal if 2D mesh normal is pointing toward -Z
	if (dir < 0) {
		meshNormals[3 * i] = -meshNormals[3 * i];
		meshNormals[3 * i + 1] = -meshNormals[3 * i + 1];
		meshNormals[3 * i + 2] = -meshNormals[3 * i + 2];
	}
}