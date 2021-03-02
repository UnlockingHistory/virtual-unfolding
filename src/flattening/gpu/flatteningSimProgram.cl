// Physics-based simulation for flat mesh.
// Forces 2D edge lengths to equal corresponding edge lengths in 3D.

__kernel void flatteningSim(
	__global __write_only float *nextPositions2D,
	__global __write_only float *nextVelocities2D,
    __global __read_only float *positions2D,
	__global __read_only float *velocities2D,
	__global __read_only float *positions3D,
    __global __read_only int *neighbors
) {
	const size_t i =  get_global_id(0);

	const float2 position2D  = { positions2D[2 * i], positions2D[2 * i + 1] };
	const float2 velocity2D  = { velocities2D[2 * i], velocities2D[2 * i + 1] };

	// Set default values.
	nextPositions2D[2 * i] = position2D.x;
	nextPositions2D[2 * i + 1] = position2D.y;
	nextVelocities2D[2 * i] = velocity2D.x;
	nextVelocities2D[2 * i + 1] = velocity2D.y;
	
	// This point has not been mapped to 2D.
	if (position2D.x == NULL_FLOAT32) {
		return;
	}

	const float3 position3D = { positions3D[3 * i], positions3D[3 * i + 1], positions3D[3 * i + 2] };

	// Add up forces from neighbors.
	float2 totalForce = { 0.0f, 0.0f };
	for (int j = 0; j < MAX_NUM_NEIGHBORS; j++) {
		const int neighborIndex = neighbors[MAX_NUM_NEIGHBORS * i + j];
		if (neighborIndex == NULL_INT32) {
			break;
		}
		const float2 neighborPosition2D  = { positions2D[2 * neighborIndex], positions2D[2 * neighborIndex + 1] };
		if (neighborPosition2D.x == NULL_FLOAT32) {
			continue;// neighbor is not active
		}

		const float3 neighborPosition3D = { positions3D[3 * neighborIndex], positions3D[3 * neighborIndex + 1], positions3D[3 * neighborIndex + 2] };
		float nominalLength = length(neighborPosition3D - position3D);
		// Set minimum edge length to ensure that the simulation doesn't explode.
		if (nominalLength < 0.5f) {
			nominalLength = 0.5f;
		}

		const float K = AXIAL_STIFFNESS / nominalLength;
		const float D = 2.0f * sqrt(K) * DAMPING_FACTOR;

		const float2 neighborVelocity2D  = { velocities2D[2 * neighborIndex], velocities2D[2 * neighborIndex + 1] };

		const float2 edgeVector = neighborPosition2D - position2D;
		const float edgeLength = length(edgeVector);
		const float diff = edgeLength - nominalLength;
		
		// Axial components
		totalForce += edgeVector * (K * diff / edgeLength);// Spring force.
		totalForce += (neighborVelocity2D - velocity2D) * D;// Damping force.
	}

	// TODO: possible to compile as single precision float?
	const float dt = convert_float(DT);

	const float2 nextVelocity2D = velocity2D + totalForce * dt;
	nextVelocities2D[2 * i] = nextVelocity2D.x;
	nextVelocities2D[2 * i + 1] = nextVelocity2D.y;

	const float2 nextPosition2D = position2D + nextVelocity2D * dt;
	nextPositions2D[2 * i] = nextPosition2D.x;
	nextPositions2D[2 * i + 1] = nextPosition2D.y;
}