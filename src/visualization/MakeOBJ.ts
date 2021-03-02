import { Vector2 } from 'three';
import { texturingParams } from '../common/Defaults';
import { getRuntimeParams } from '../common/utils';
import TextureMap from '../texturing/TextureMap';

const fileParams = getRuntimeParams();
const MESH_NUM = process.env.MESH_NUM ? parseInt(process.env.MESH_NUM) : 0;
const SCALE = process.env.SCALE ? parseInt(process.env.SCALE) : 1;
const SCALE_FINE = process.env.SCALE_FINE ? parseInt(process.env.SCALE_FINE) : 1;

const params = {...texturingParams, ...{
	SCALE: 1,
	PADDING: new Vector2(0, 0),
	Z_OFFSET: 0,
}};

const textureMap = new TextureMap(fileParams, params);
textureMap.saveTriangleMesh(fileParams, params, MESH_NUM, SCALE, SCALE_FINE);