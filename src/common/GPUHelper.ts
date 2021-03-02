// @ts-ignore
import * as cl from 'node-opencl';
import { log, isUint8, isFloat32, isInt32, nullValForType, checkType, gpuTypeForType, typeForGPUType, stringifyVector3, isArray, isInteger } from './utils';
import { Type, GPUBufferDataType, TomType, GPUTypedArray, TomTypedArray } from './types';
import { closeSync, openSync, readFileSync } from 'fs';
import { BufferedTomDataR } from './BufferedTomDataR';
import { Vector3 } from 'three';
import { getBinDataType, getTomDataType, readBin } from './io';
import { BufferedTomDataW } from './BufferedTomDataW';
import MutableTypedArray from './MutableTypedArray';

type ReadWrite = 'read' | 'write' | 'readwrite';
type KernelVariableType = 'float' | 'int' | 'int2' | 'uchar';

interface GPUBuffer {
	buffer: any,
	length: number,
	bytesPerElement: number,
	readwrite: ReadWrite,
	dataType: GPUBufferDataType,
	bufferName: string, 
}

interface compileArg {
	value: number,
	type: Type,
}

// TODO: node-opencl does not have type declarations.

export default class GPUHelper {
	private gpuBuffers: { [key: string]: GPUBuffer; } = {};
	private kernels: { [key: string]: any; } = {};
	private events: any[] = [];
	private device: any;
	private context: any;
	private queue: any;

    constructor(DEVICE_NUM: number) {
		log('\nInitializing GPU...\n')
        // Choose platform.
		const platforms = cl.getPlatformIDs();
		log('Available platforms:');
        for (let i = 0; i < platforms.length; i++) {
            log(`\tPlatform ${i}: ${cl.getPlatformInfo(platforms[i], cl.PLATFORM_NAME)}`);
        }
        const platform = platforms[0];
        log(`Using Platform: ${cl.getPlatformInfo(platform, cl.PLATFORM_NAME)}\n`);

		// Choose device.
		const devices = cl.getDeviceIDs(platform, cl.DEVICE_TYPE_ALL);
		log('Available devices:');
        for (let i = 0; i < devices.length; i++) {
            log(`\tDevices ${i}: ${cl.getDeviceInfo(devices[i], cl.DEVICE_NAME)}`);
        }
        this.device = devices[DEVICE_NUM];
        log(`Using Device: ${cl.getDeviceInfo(this.device, cl.DEVICE_NAME)}\n`);

        // Create context.
        this.context = cl.createContext([cl.CONTEXT_PLATFORM, platform], devices);

        // Create command queue.
        if (cl.createCommandQueueWithProperties !== undefined) {
            this.queue =
                cl.createCommandQueueWithProperties(this.context, this.device, []); // OpenCL 2
        } else {
            this.queue = cl.createCommandQueue(this.context, this.device, null); // OpenCL 1.x
        }
    }

    initProgram(path: string, programName: string, programCompileArgs?: {[key: string]: compileArg}) {
        if (this.kernels[programName]) {
            throw new Error(`Program: ${programName} already inited.`);
		}
        const program = cl.createProgramWithSource(this.context, readFileSync(path, 'utf8'));

		// Init compile args.
		const globalCompileArgs: {[key: string]: compileArg} = {
			NULL_FLOAT32: {
				value: nullValForType('float32'),
				type: 'float32',
			},
			NULL_INT32: {
				value: nullValForType('int32'),
				type: 'int32',
			},
		};
		
		// Check that compile args aren't overlapping.
		if (programCompileArgs) {
			Object.keys(globalCompileArgs).forEach(argKey => {
				if (Object.keys(programCompileArgs).indexOf(argKey) >= 0) {
					throw new Error(`Duplicate OpenCL compile arg ${argKey}.`)
				}
			});
		}
		const compileArgs = {...globalCompileArgs, ...programCompileArgs};

		// Check types.
		Object.keys(compileArgs).forEach(argKey => {
			const { value, type } = compileArgs[argKey];
			if (!checkType(value, type)){
				throw new Error(`Invalid type for compile arg ${argKey}: expected ${type}, got ${value}.`);
			}
		});

		// Create args string.
		let compileArgsString = Object.keys(compileArgs).reduce((string, argKey) => {
			return string += `-D ${argKey}=${compileArgs[argKey].value} `;
		}, '');
		// // Additional options.
		// // https://www.khronos.org/registry/OpenCL/sdk/1.2/docs/man/xhtml/clCompileProgram.html
		// compileArgsString += '-cl-single-precision-constant ';
		// compileArgsString += '-cl-fp32-correctly-rounded-divide-sqrt ';
		// compileArgsString += '-cl-opt-disable ';

        // Build and create kernel object
        try {
            cl.buildProgram(program, undefined, compileArgsString);
			this.kernels[programName] = cl.createKernel(program, programName);
			log(`\tBuild log for CL program ${programName}: ${cl.getProgramBuildInfo(program, this.device, cl.PROGRAM_BUILD_LOG)}`);
        } catch (err) {
            log(err);
            throw new Error(cl.getProgramBuildInfo(program, this.device, cl.PROGRAM_BUILD_LOG));
        }
    }

    gpuBufferExists(bufferName: string) {
        return this.gpuBuffers[bufferName] !== undefined;
	}

	gpuProgramExists(programName: string) {
        return this.kernels[programName] !== undefined;
	}
	
	lengthForGPUBuffer(bufferName: string) {
		if (!this.gpuBufferExists(bufferName)) {
            return null;
        }
        return this.gpuBuffers[bufferName].length;
    }

    typeForGPUBuffer(bufferName: string) {
        if (!this.gpuBufferExists(bufferName)) {
            return null;
        }
        return this.gpuBuffers[bufferName].dataType;
    }

	//Create buffer on gpu memory.
	createGPUBuffer(bufferName: string, data: Float32Array | null, dataType: 'float*', readwrite: ReadWrite, length?: number, forceOverwrite?: boolean): void;
	createGPUBuffer(bufferName: string, data: Int32Array | null, dataType: 'int*', readwrite: ReadWrite, length?: number, forceOverwrite?: boolean): void;
	createGPUBuffer(bufferName: string, data: Uint8Array | null, dataType: 'uchar*', readwrite: ReadWrite, length?: number, forceOverwrite?: boolean): void;
    createGPUBuffer(bufferName: string, data: any, dataType: GPUBufferDataType, readwrite: ReadWrite, length = data.length, forceOverwrite = false) {
        let bytesPerElement;
        switch (dataType) {
            case 'float*':
                bytesPerElement = 4;
                break;
            case 'int*':
                bytesPerElement = 4;
                break;
            case 'uchar*':
                bytesPerElement = 1;
                break;
            default:
                throw new Error(`Unsupported type: ${dataType}`);
        }
        if (this.gpuBufferExists(bufferName)) {
			if (!forceOverwrite) log(`Buffer ${bufferName} already exists, use GPUHelper.copyDataToGPUBuffer() instead.`);
            this.releaseGPUBuffer(bufferName);
        }
        let readwriteCode;
        switch (readwrite) {
            case 'read':
                readwriteCode = cl.MEM_READ_ONLY;
                break;
            case 'write':
                readwriteCode = cl.MEM_WRITE;
                break;
            case 'readwrite':
                readwriteCode = cl.MEM_READ_WRITE;
                break;
            default:
                throw new Error(`Unsupported readwrite type: ${readwrite}`);
        }
        this.gpuBuffers[bufferName] = {
            buffer: cl.createBuffer(this.context, readwriteCode, length * bytesPerElement),
            length,
            bytesPerElement,
            readwrite,
			dataType,
			bufferName, 
        };
        if (data) {
            this.copyDataToGPUBuffer(bufferName, data, 0, length);
        }
	}

	createGpuBufferFromMutableTypedArray(bufferName: string, array: MutableTypedArray, readwrite: ReadWrite, length = array.getLength(), forceOverwrite?: boolean) {
		// @ts-ignore
		this.createGPUBuffer(bufferName, array.getData(), gpuTypeForType(array.type), readwrite, length * array.numElementsPerIndex, forceOverwrite);
	}

	createGPUBufferFromTom(bufferName: string, path: string, filename: string, readwrite: ReadWrite, forceOverwrite?: boolean) {
		const tom = new BufferedTomDataR(path, filename, 0);
		const { dim, type, numElementsPerVoxel } = tom;
		if (type !== 'int32' && type !== 'uint8' && type !== 'float32') {
			throw new Error(`Invalid tom type ${type} for gpuHelper.createGPUBufferFromTom().`)
		}
		// Init empty buffer.
		// @ts-ignore
		this.createGPUBuffer(bufferName, null, gpuTypeForType(type), readwrite, dim.x * dim.y * dim.z * numElementsPerVoxel, forceOverwrite);

		for (let z = 0; z < dim.z; z++) {
			const array = tom.getData(z);
			this.copyDataToGPUBuffer(bufferName, array as GPUTypedArray, z * array.length, array.length, true);
		}

		// Save and close file.
		tom.close();
	}

	createFloat32GPUBufferFromTom(bufferName: string, path: string, filename: string, readwrite: ReadWrite, forceOverwrite?: boolean) {
		const type = getTomDataType(path, filename);
		if (type === 'float32') {
			return this.createGPUBufferFromTom(bufferName, path, filename, readwrite, forceOverwrite);
		}
		// We need to cast data to float32 before sending to gpu.
		const tom = new BufferedTomDataR(path, filename, 0);
		const { dim, numElementsPerVoxel } = tom;

		// Init empty buffer.
		// @ts-ignore
		this.createGPUBuffer(bufferName, null, 'float*', readwrite, dim.x * dim.y * dim.z * numElementsPerVoxel, forceOverwrite);
		// Init float32 buffer.
		const floatArray = new Float32Array(dim.x * dim.y * numElementsPerVoxel);
		for (let z = 0; z < dim.z; z++) {
			const array = tom.getData(z);
			for (let i = 0; i < floatArray.length; i++) {
				floatArray[i] = array[i];
			}
			this.copyDataToGPUBuffer(bufferName, floatArray, z * floatArray.length, floatArray.length, true);
		}

		// Save and close file.
		tom.close();
	}

	createGPUBufferFromBin(bufferName: string, path: string, filename: string, readwrite: ReadWrite, forceOverwrite?: boolean) {
		// Open file.
		const file = openSync(`${path}${filename}.bin`, 'r');
		const type = getBinDataType(path, filename, file);
		
		if (type !== 'int32' && type !== 'uint8' && type !== 'float32') {
			throw new Error(`Invalid tom type ${type} for gpuHelper.createGPUBufferFromBin().`)
		}
		
		// Get contents.
		const data = readBin(path, filename, file);
		
		// Init empty buffer.
		// @ts-ignore
		this.createGPUBuffer(bufferName, data as GPUTypedArray, gpuTypeForType(type), readwrite, data.length, forceOverwrite);

		// Close file.
		closeSync(file);
	}

	writeTomFromGPUBuffer(bufferName: string, path: string, filename: string, dimensions: Vector3, numElements = 1, useNull = false) {
		const bufferInfo = this.gpuBuffers[bufferName];
        if (!bufferInfo) {
            throw new Error(`Invalid GPU buffer name: ${bufferName}`);
		}
		if (dimensions.x * dimensions.y * dimensions.z * numElements != bufferInfo.length) {
			throw new Error(`Invalid dimensions ${stringifyVector3(dimensions)} for gpu buffer with type ${bufferInfo.dataType} and  length ${bufferInfo.length}.`);
		}

		const tom = new BufferedTomDataW(path, filename, typeForGPUType(bufferInfo.dataType) as TomType, dimensions, numElements, useNull);

		for (let z = 0; z < dimensions.z; z++) {
			// Copy data into layer buffer and write to disk.
			const array = tom.getData();
			this.copyDataFromGPUBuffer(bufferName, array as GPUTypedArray, z * array.length);
			tom.writeLayer(z);
		}

		// Save and close file.
		tom.close();
	}

	mutableTypedArrayFromGPUBuffer(bufferName: string, type: Type, useNull: boolean, numElements: number) {
		const bufferInfo = this.gpuBuffers[bufferName];
        if (!bufferInfo) {
            throw new Error(`Invalid GPU buffer name: ${bufferName}`);
		}
		let array;
		switch(type) {
			case 'uint8':
				array = new Uint8Array(bufferInfo.length);
				break;
			case 'int32':
				array = new Int32Array(bufferInfo.length);
				break;
			case 'float32':
				array = new Float32Array(bufferInfo.length);
				break;
			default:
				throw new Error(`Unsupported gpu buffer type ${type}.`);
		}
		this.copyDataFromGPUBuffer(bufferName, array);
		return new MutableTypedArray(array, useNull, numElements);
	}
	
	nullBuffer(bufferName: string) {
		this.setBufferValue(bufferName, null);
	}

	zeroBuffer(bufferName: string) {
		this.setBufferValue(bufferName, 0);
	}

	setBufferValue(bufferName: string, value: number | null) {
		const { dataType, length } = this.gpuBuffers[bufferName];
		// if (isArray(value)) {
		// 	length / (value as number[]).length;
		// 	if (!isInteger(length)) {
		// 		throw new Error(`Invalid value ${value} for buffer of length ${this.gpuBuffers[bufferName].length}.`);
		// 	}
		// 	switch (dataType) {
		// 		case 'float*':
		// 			if (!this.gpuProgramExists('setFloatValue')) {
		// 				this.initProgram(`./src/common/gpu/setValueProgram.cl`, 'setFloatValue');
		// 			}
		// 			this.setBufferArgument('setFloatValue', 0, bufferName);
		// 			if (val === null) val = nullValForType('float32');
		// 			this.setKernelArgument('setFloatValue', 1, 'float', val);
				// this.setKernelArgument('setFloatValue', 1, 'float', val);
				// this.setKernelArgument('setFloatValue', 1, 'float', val);
		// 			this.runProgram('setFloatValue', length);
		// 			break;
		// 		default:
		// 			throw new Error(`Unsupported dataType for gpuHelper.setBufferValue: ${dataType}`);
		// 	}
		// }
		let val = value as number | null;
		switch (dataType) {
            case 'int*':
				if (!this.gpuProgramExists('setIntValue')) {
					this.initProgram(`./src/common/gpu/setValueProgram.cl`, 'setIntValue');
				}
				this.setBufferArgument('setIntValue', 0, bufferName);
				if (val === null) val = nullValForType('int32');
				this.setKernelArgument('setIntValue', 1, 'int', val);
				this.runProgram('setIntValue', length);
                break;
            case 'float*':
				if (!this.gpuProgramExists('setFloatValue')) {
					this.initProgram(`./src/common/gpu/setValueProgram.cl`, 'setFloatValue');
				}
				this.setBufferArgument('setFloatValue', 0, bufferName);
				if (val === null) val = nullValForType('float32');
				this.setKernelArgument('setFloatValue', 1, 'float', val);
				this.runProgram('setFloatValue', length);
				break;
			case 'uchar*':
				if (!this.gpuProgramExists('setUCharValue')) {
					this.initProgram(`./src/common/gpu/setValueProgram.cl`, 'setUCharValue');
				}
				this.setBufferArgument('setUCharValue', 0, bufferName);
				if (val === null) val = nullValForType('uint8');
				this.setKernelArgument('setUCharValue', 1, 'uchar', val);
				this.runProgram('setUCharValue', length);
				break;
            default:
                throw new Error(`Unsupported dataType for gpuHelper.setBufferValue: ${dataType}`);
        }
	}

    releaseGPUBuffer(bufferName: string) {
        const bufferInfo = this.gpuBuffers[bufferName];
        cl.releaseMemObject(bufferInfo.buffer);
        delete this.gpuBuffers[bufferName];
        // TODO: remove as variable arg.
    }

    copyDataToGPUBuffer(bufferName: string, data: GPUTypedArray, start = 0, length = data.length, blocking = true) {
        const bufferInfo = this.gpuBuffers[bufferName];
        if (!bufferInfo) {
            throw new Error(`Invalid GPU buffer name: ${bufferName}`);
        }

        let events = [];
        // Use blocking copy and store last event.
        if (blocking) {
            ({ events } = this);
            this.events = [];
		}
		// try {
		this.events.push(cl.enqueueWriteBuffer(this.queue, bufferInfo.buffer, true,
			start * bufferInfo.bytesPerElement, length * bufferInfo.bytesPerElement,
			data, events, true));
		// } catch(error) {
		// 	console.log(this.getErrorString(error));
		// 	throw new Error(error);
		// }
        
	}

    copyDataFromGPUBuffer(bufferName: string, output: GPUTypedArray, start = 0, length = output.length) {
        const bufferInfo = this.gpuBuffers[bufferName];
        if (!bufferInfo) {
            throw new Error(`Invalid GPU buffer name: ${bufferName}`);
        }
        // Use blocking copy and store last event.
        this.events = [cl.enqueueReadBuffer(this.queue, bufferInfo.buffer, true,
            start * bufferInfo.bytesPerElement, length * bufferInfo.bytesPerElement,
            output, this.events, true)];
        this.finishAllEvents();
	}

	copyDataToMutableTypedArray(bufferName: string, array: MutableTypedArray, start = 0, length = array.getLength()) {
		// @ts-ignore
		this.copyDataFromGPUBuffer(bufferName, array.getData(), start, length * array.numElementsPerIndex);
	}
	
    setKernelArgument(programName: string, num: number, type: KernelVariableType, value: number) {
		// Check values.
		switch(type) {
			case 'uchar':
				if (!isUint8(value as number)) {
					throw new Error(`Kernel argument ${value} is not a uint8.`);
				}
				break;
			case 'float':
				if (!isFloat32(value as number)) {
					throw new Error(`Kernel argument ${value} is not a float32.`);
				}
				break;
			case 'int':
				if (!isInt32(value as number)) {
					throw new Error(`Kernel argument ${value} is not a int32.`);
				}
				break;
			default:
				throw new Error('Unknown kernel variable type.');
		}
        cl.setKernelArg(this.kernels[programName], num, type, value);
    }

    setBufferArgument(programName: string, num: number, bufferName: string) {
        const bufferInfo = this.gpuBuffers[bufferName];
        if (!bufferInfo) {
            throw new Error(`Unknown buffer: ${bufferName}.`);
        }
        const kernel = this.kernels[programName];
        if (!kernel) {
            throw new Error(`Unknown program: ${programName}.`);
        }
        cl.setKernelArg(kernel, num, bufferInfo.dataType, bufferInfo.buffer);
    }

    runProgram(programName: string, numThreads: number) {
        this.events = [cl.enqueueNDRangeKernel(this.queue, this.kernels[programName], 1,
            null, [numThreads], null, this.events, true)];
    }

    finishAllEvents() {
        if (this.events.length === 0) {
            return;
        }
        cl.waitForEvents(this.events);
        this.events = [];
    }

    clear(gpuBuffersToKeep: string[] = []) {
        this.finishAllEvents();
        Object.values(this.gpuBuffers).forEach((bufferInfo) => {
			if (gpuBuffersToKeep.indexOf(bufferInfo.bufferName) >= 0) {
				return;
			}
			cl.releaseMemObject(bufferInfo.buffer);
			delete this.gpuBuffers[bufferInfo.bufferName];
        });
        Object.values(this.kernels).forEach((kernel) => {
            cl.releaseKernel(kernel);
        });
        this.events.forEach((event) => {
            cl.releaseEvent(event);
		});
		cl.finish(this.queue);
        this.kernels = {};
        this.events = [];
	}

	getErrorString(error: number) {
		switch(error){
			// run-time and JIT compiler errors
			case 0: return "CL_SUCCESS";
			case -1: return "CL_DEVICE_NOT_FOUND";
			case -2: return "CL_DEVICE_NOT_AVAILABLE";
			case -3: return "CL_COMPILER_NOT_AVAILABLE";
			case -4: return "CL_MEM_OBJECT_ALLOCATION_FAILURE";
			case -5: return "CL_OUT_OF_RESOURCES";
			case -6: return "CL_OUT_OF_HOST_MEMORY";
			case -7: return "CL_PROFILING_INFO_NOT_AVAILABLE";
			case -8: return "CL_MEM_COPY_OVERLAP";
			case -9: return "CL_IMAGE_FORMAT_MISMATCH";
			case -10: return "CL_IMAGE_FORMAT_NOT_SUPPORTED";
			case -11: return "CL_BUILD_PROGRAM_FAILURE";
			case -12: return "CL_MAP_FAILURE";
			case -13: return "CL_MISALIGNED_SUB_BUFFER_OFFSET";
			case -14: return "CL_EXEC_STATUS_ERROR_FOR_EVENTS_IN_WAIT_LIST";
			case -15: return "CL_COMPILE_PROGRAM_FAILURE";
			case -16: return "CL_LINKER_NOT_AVAILABLE";
			case -17: return "CL_LINK_PROGRAM_FAILURE";
			case -18: return "CL_DEVICE_PARTITION_FAILED";
			case -19: return "CL_KERNEL_ARG_INFO_NOT_AVAILABLE";

			// compile-time errors
			case -30: return "CL_INVALID_VALUE";
			case -31: return "CL_INVALID_DEVICE_TYPE";
			case -32: return "CL_INVALID_PLATFORM";
			case -33: return "CL_INVALID_DEVICE";
			case -34: return "CL_INVALID_CONTEXT";
			case -35: return "CL_INVALID_QUEUE_PROPERTIES";
			case -36: return "CL_INVALID_COMMAND_QUEUE";
			case -37: return "CL_INVALID_HOST_PTR";
			case -38: return "CL_INVALID_MEM_OBJECT";
			case -39: return "CL_INVALID_IMAGE_FORMAT_DESCRIPTOR";
			case -40: return "CL_INVALID_IMAGE_SIZE";
			case -41: return "CL_INVALID_SAMPLER";
			case -42: return "CL_INVALID_BINARY";
			case -43: return "CL_INVALID_BUILD_OPTIONS";
			case -44: return "CL_INVALID_PROGRAM";
			case -45: return "CL_INVALID_PROGRAM_EXECUTABLE";
			case -46: return "CL_INVALID_KERNEL_NAME";
			case -47: return "CL_INVALID_KERNEL_DEFINITION";
			case -48: return "CL_INVALID_KERNEL";
			case -49: return "CL_INVALID_ARG_INDEX";
			case -50: return "CL_INVALID_ARG_VALUE";
			case -51: return "CL_INVALID_ARG_SIZE";
			case -52: return "CL_INVALID_KERNEL_ARGS";
			case -53: return "CL_INVALID_WORK_DIMENSION";
			case -54: return "CL_INVALID_WORK_GROUP_SIZE";
			case -55: return "CL_INVALID_WORK_ITEM_SIZE";
			case -56: return "CL_INVALID_GLOBAL_OFFSET";
			case -57: return "CL_INVALID_EVENT_WAIT_LIST";
			case -58: return "CL_INVALID_EVENT";
			case -59: return "CL_INVALID_OPERATION";
			case -60: return "CL_INVALID_GL_OBJECT";
			case -61: return "CL_INVALID_BUFFER_SIZE";
			case -62: return "CL_INVALID_MIP_LEVEL";
			case -63: return "CL_INVALID_GLOBAL_WORK_SIZE";
			case -64: return "CL_INVALID_PROPERTY";
			case -65: return "CL_INVALID_IMAGE_DESCRIPTOR";
			case -66: return "CL_INVALID_COMPILER_OPTIONS";
			case -67: return "CL_INVALID_LINKER_OPTIONS";
			case -68: return "CL_INVALID_DEVICE_PARTITION_COUNT";

			// extension errors
			case -1000: return "CL_INVALID_GL_SHAREGROUP_REFERENCE_KHR";
			case -1001: return "CL_PLATFORM_NOT_FOUND_KHR";
			case -1002: return "CL_INVALID_D3D10_DEVICE_KHR";
			case -1003: return "CL_INVALID_D3D10_RESOURCE_KHR";
			case -1004: return "CL_D3D10_RESOURCE_ALREADY_ACQUIRED_KHR";
			case -1005: return "CL_D3D10_RESOURCE_NOT_ACQUIRED_KHR";
			default: return "Unknown OpenCL error";
		}
	}

    destroy() {
        this.clear();

        // Deallocate context, queue, device.
        cl.releaseContext(this.context);
        this.context = null;
        cl.releaseCommandQueue(this.queue);
        this.queue = null;
        // TODO: release device?
        // cl.releaseDevice(this.device);
        this.device = null;
    }
}