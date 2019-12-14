import { DecoderPlugin } from '../DecoderPlugin';
export declare class Label15 extends DecoderPlugin {
    name: string;
    qualifiers(): {
        labels: string[];
        preambles: string[];
    };
    decode(message: any): any;
}
declare const _default: {};
export default _default;
