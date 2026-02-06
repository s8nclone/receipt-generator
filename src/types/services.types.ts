/* eslint-disable no-unused-vars */
export interface ILogger {
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
}

export interface IPDFGenerator {
    generate(data: any): Promise<Buffer>;
}

export interface IQueueManager {
    enqueueReceiptGeneration(data: any): Promise<any>;
    enqueueCloudinaryUpload(data: any): Promise<any>;
    enqueueEmailDelivery(data: any): Promise<any>;
}