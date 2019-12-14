import { DecoderPlugin } from '../DecoderPlugin';
export declare class LabelColonComma extends DecoderPlugin {
    name: string;
    qualifiers(): {
        labels: string[];
    };
    decode(message: any): any;
}
declare const _default: {};
export default _default;
