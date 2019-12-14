import { DecoderPlugin } from '../DecoderPlugin';
export declare class Label80 extends DecoderPlugin {
    name: string;
    descriptions: any;
    qualifiers(): {
        labels: string[];
        preambles: string[];
    };
    decode(message: any): any;
}
declare const _default: {};
export default _default;
