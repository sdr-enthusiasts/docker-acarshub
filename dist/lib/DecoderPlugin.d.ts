import { DecoderPluginInterface } from './DecoderPluginInterface';
export declare abstract class DecoderPlugin implements DecoderPluginInterface {
    decoder: any;
    name: string;
    defaultResult: any;
    options: Object;
    constructor(decoder: any, options?: any);
    id(): string;
    meetsStateRequirements(): boolean;
    qualifiers(): any;
    decode(message: any): any;
}
declare const _default: {};
export default _default;
