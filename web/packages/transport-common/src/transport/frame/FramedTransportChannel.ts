/**
 * Copyright 2017 Plexus Interop Deutsche Bank AG
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { MessageFrame, ChannelCloseFrame } from "./model";
import { FrameHeader } from "./FrameHeader";
import { TransportChannel } from "../TransportChannel";
import { FramedTransport } from "./FramedTransport";
import { UniqueId } from "../../transport/UniqueId";
import { Observer, ReadWriteCancellationToken } from "@plexus-interop/common";
import { AnonymousSubscription, Subscription } from "rxjs/Subscription";
import { StateMaschineBase, Arrays, CancellationToken, LoggerFactory, Logger, StateMaschine, SequencedExecutor } from "@plexus-interop/common";
import { clientProtocol as plexus, SuccessCompletion, ClientProtocolUtils, ClientError, ErrorCompletion } from "@plexus-interop/protocol";
import { Frame } from "./model/Frame";
import { ChannelObserver } from "../../common/ChannelObserver";

export type ChannelState = "CREATED" | "OPEN" | "CLOSED" | "CLOSE_RECEIVED" | "CLOSE_REQUESTED";

export const ChannelState = {
    CREATED: "CREATED" as ChannelState,
    OPEN: "OPEN" as ChannelState,
    CLOSED: "CLOSED" as ChannelState,
    CLOSE_RECEIVED: "CLOSE_RECEIVED" as ChannelState,
    CLOSE_REQUESTED: "CLOSE_REQUESTED" as ChannelState
};

export class FramedTransportChannel implements TransportChannel {

    private log: Logger;
    private messageId: number = 0;

    private readonly stateMachine: StateMaschine<ChannelState>;

    private channelCancellationToken: ReadWriteCancellationToken;

    private clientCompletion: plexus.ICompletion;
    private remoteCompletion: plexus.ICompletion;
    private channelObserver: Observer<ArrayBuffer>;

    private writeExecutor: SequencedExecutor;

    private onCloseHandler: ((completion?: plexus.ICompletion) => void) | null;

    constructor(
        private id: UniqueId,
        private framedTransport: FramedTransport,
        private dispose: () => Promise<void>,
        baseReadToken: CancellationToken) {
        this.log = LoggerFactory.getLogger(`FramedTransportChannel [${id.toString()}]`);
        this.writeExecutor = new SequencedExecutor(this.log);
        this.channelCancellationToken = new ReadWriteCancellationToken(new CancellationToken(baseReadToken));
        this.log.debug("Created");
        this.stateMachine = new StateMaschineBase<ChannelState>(ChannelState.CREATED, [
            {
                from: ChannelState.CREATED, to: ChannelState.OPEN
            },
            // client requested to complete channel, waiting for response
            {
                from: ChannelState.OPEN, to: ChannelState.CLOSE_REQUESTED
            },
            // remote side requested to complete channel
            {
                from: ChannelState.OPEN, to: ChannelState.CLOSE_RECEIVED
            },
            // client confirmed channel closure
            {
                from: ChannelState.CLOSE_RECEIVED, to: ChannelState.CLOSED
            },
            // remote confirmed channel closure
            {
                from: ChannelState.CLOSE_REQUESTED, to: ChannelState.CLOSED
            },
            // forced channel closure
            {
                from: ChannelState.OPEN, to: ChannelState.CLOSED, preHandler: async () => {
                    this.log.warn("Channel forced OPEN -> CLOSED");
                }
            },
            {
                from: ChannelState.CREATED, to: ChannelState.CLOSED, preHandler: async () => {
                    this.log.warn("Channel forced CREATED -> CLOSED");
                }
            }
        ]);
    }

    private async handleConnectionError(channelObserver: Observer<ArrayBuffer>, error: any): Promise<void> {
        if (!this.channelCancellationToken.isReadCancelled()) {
            this.log.error("Transport connection error received", error);
            this.closeInternal("Transport connection error", error);
        }
    }

    public open(channelObserver: ChannelObserver<AnonymousSubscription, ArrayBuffer>): void {
        this.log.debug("Opening channel");
        this.stateMachine.throwIfNot(ChannelState.CREATED);
        this.channelObserver = channelObserver;
        const subscription = new Subscription(() => {
            this.log.debug("Closing on unsubscribe");
            this.close();
        });
        this.stateMachine.goAsync(ChannelState.OPEN)
            .then(() => {
                this.subscribeToMessages(channelObserver);
                channelObserver.started(subscription);
            });
    }

    private async subscribeToMessages(channelObserver: Observer<ArrayBuffer>): Promise<void> {
        let resultBuffer = new ArrayBuffer(0);
        this.framedTransport.open({

            next: (frame: Frame) => {
                resultBuffer = this.handleIncomingFrame(channelObserver, frame, resultBuffer);
            },

            complete: () => this.log.debug("Received complete from transport"),

            error: (transportError) => this.handleConnectionError(channelObserver, transportError)

        })
            .catch(connectionError => channelObserver.error(connectionError));
    }

    private remoteCompletionToError(completion: plexus.ICompletion): plexus.IError {
        if (completion) {
            return completion.error || new ClientError(`Remote completed with status ${this.remoteCompletion.status}`);
        } else {
            return new ClientError("Channel closed unexpectedly");
        }
    }

    public uuid(): UniqueId {
        return this.id;
    }

    public async close(completion: plexus.ICompletion = new SuccessCompletion()): Promise<plexus.ICompletion> {
        this.stateMachine.throwIfNot(ChannelState.OPEN, ChannelState.CLOSE_RECEIVED);
        // wait for remote side if required and report result
        return new Promise<plexus.ICompletion>((resolve, reject) => {
            (async () => {
                // handler called when remote side also sent its completion
                this.onCloseHandler = (summarizedCompletion?: plexus.ICompletion) => {
                    resolve(summarizedCompletion);
                };
                if (this.stateMachine.is(ChannelState.OPEN)) {
                    // wait for remote side response
                    this.sendChannelClosedRequest(completion);
                    this.stateMachine.go(ChannelState.CLOSE_REQUESTED);
                } else {
                    // remote is completed already, send message and clean up
                    this.sendChannelClosedRequest(completion);
                    this.closeInternal("Remote completed, confirmation sent");
                }
            })()
                .catch(e => {
                    this.log.error("Error during sending close channel request", e);
                    reject(e);
                });
        });
    }

    private handleIncomingFrame(channelObserver: Observer<ArrayBuffer>, frame: Frame, resultBuffer: ArrayBuffer): ArrayBuffer {
        if (this.channelCancellationToken.isReadCancelled()) {
            this.log.warn("Read cancelled, dropping frame");
            return resultBuffer;
        }
        if (!frame) {
            this.log.warn("Empty frame, dropping it");
        } else if (frame.internalHeaderProperties.messageFrame) {
            const messageFrame = frame as MessageFrame;
            const isLast = !messageFrame.getHeaderData().hasMore;
            /* istanbul ignore if */
            if (this.log.isTraceEnabled()) {
                this.log.trace(`Received ${isLast ? "last" : ""} message frame, ${messageFrame.body.byteLength} bytes`);
            }
            resultBuffer = Arrays.concatenateBuffers(resultBuffer, messageFrame.body);
            if (isLast) {
                /* istanbul ignore if */
                if (this.log.isTraceEnabled()) {
                    this.log.trace(`Received message of ${resultBuffer.byteLength} bytes`);
                }
                channelObserver.next(resultBuffer);
                resultBuffer = new ArrayBuffer(0);
            }
        } else if (frame.internalHeaderProperties.channelClose) {
            this.onChannelClose(frame as ChannelCloseFrame);
        } else {
            this.log.warn("Unknown frame received", frame);
        }
        return resultBuffer;
    }

    public async onChannelClose(channelCloseFrame: ChannelCloseFrame): Promise<void> {
        if (this.log.isDebugEnabled()) {
            this.log.debug(`Channel close received, current state is ${this.stateMachine.getCurrent()}`);
        }
        this.stateMachine.throwIfNot(ChannelState.CLOSE_REQUESTED, ChannelState.OPEN);
        this.remoteCompletion = channelCloseFrame.getHeaderData().completion || new SuccessCompletion();
        /* istanbul ignore if */
        if (this.remoteCompletion && this.log.isDebugEnabled()) {
            this.log.debug(`Remote completed with ${JSON.stringify(this.remoteCompletion)}`);
        }
        if (!ClientProtocolUtils.isSuccessCompletion(this.remoteCompletion)) {
            // channel closed with error, report error and close
            const error = this.remoteCompletionToError(this.remoteCompletion);
            this.closeInternal("Channel Close with error received", error);
        } else {
            this.channelObserver.complete();
            switch (this.stateMachine.getCurrent()) {
                case ChannelState.OPEN:
                    this.channelCancellationToken.cancelRead("Channel close received");
                    this.stateMachine.go(ChannelState.CLOSE_RECEIVED);
                    break;
                case ChannelState.CLOSE_REQUESTED:
                    this.closeInternal("Remote channel close received");
                    break;
                default:
                    throw new Error(`Can't handle close, invalid state ${this.stateMachine.getCurrent()}`);
            }
        }
    }

    public async closeInternal(reason: string = "Channel closed", error?: any): Promise<void> {
        if (this.stateMachine.is(ChannelState.CLOSED)) {
            this.log.error("Channel already closed");
            return Promise.reject("Channel already closed");
        }
        this.log.debug(`Closing channel resources, reason - ${reason}`);
        this.channelCancellationToken.cancel(reason);
        this.stateMachine.go(ChannelState.CLOSED);
        this.dispose();
        if (this.onCloseHandler) {
            this.log.debug("Reporting summarized completion");
            const completion = ClientProtocolUtils.createSummarizedCompletion(this.clientCompletion, this.remoteCompletion || new ErrorCompletion("Remote side not completed"));
            if (!ClientProtocolUtils.isSuccessCompletion(completion)) {
                this.channelObserver.error(error || completion.error);
            }
            this.onCloseHandler(completion);
            this.onCloseHandler = null;
        } else if (this.channelObserver) {
            this.log.debug("Close not requested, reporting forced close");
            this.channelObserver.error(error || new ClientError(reason));
        }
    }

    private async sendChannelClosedRequest(completion: plexus.ICompletion = new SuccessCompletion()): Promise<void> {
        this.clientCompletion = completion;
        this.channelCancellationToken.cancelWrite("Close requested");
        this.log.debug("Sending channel close frame");
        this.writeExecutor.submit(async () => {
            this.framedTransport.writeFrame(ChannelCloseFrame.fromHeaderData({
                channelId: this.id,
                completion
            }));
        });
    }

    public sendLastMessage(data: ArrayBuffer): Promise<plexus.ICompletion> {
        this.stateMachine.throwIfNot(ChannelState.OPEN, ChannelState.CLOSE_RECEIVED);
        return this.sendMessage(data).then(() => {
            return this.close();
        });
    }

    public async sendMessage(data: ArrayBuffer): Promise<void> {
        this.stateMachine.throwIfNot(ChannelState.OPEN, ChannelState.CLOSE_RECEIVED);
        let currentMessageIndex = ++this.messageId;
        /* istanbul ignore if */
        if (this.log.isTraceEnabled()) {
            this.log.trace(`Scheduling sending [${currentMessageIndex}] message of ${data.byteLength} bytes`);
        }
        return this.writeExecutor.submit(() => this.sendMessageInternal(data, currentMessageIndex));
    }

    private async sendMessageInternal(data: ArrayBuffer, messageIndex: number): Promise<void> {
        this.log.debug(`Sending message [${messageIndex}] of ${data.byteLength} bytes`);
        let sentBytesCount = 0;
        const totalBytesCount = data.byteLength;
        let hasMoreFrames = false;
        let framesCounter = 0;
        do {
            let frameLength = totalBytesCount - sentBytesCount;
            if (frameLength > this.framedTransport.getMaxFrameSize()) {
                frameLength = this.framedTransport.getMaxFrameSize();
            }
            const frameBody = data.slice(sentBytesCount, sentBytesCount + frameLength);
            sentBytesCount += frameLength;
            hasMoreFrames = sentBytesCount < totalBytesCount;
            const frameHeader: FrameHeader = {
                channelId: this.id,
                length: frameLength,
                hasMore: hasMoreFrames
            };
            await this.framedTransport.writeFrame(MessageFrame.fromHeaderData(frameHeader, frameBody));
            framesCounter++;
        } while (hasMoreFrames && !this.channelCancellationToken.isWriteCancelled());
        this.log.trace(`Sent message [${messageIndex}], consist of ${framesCounter} frames, ${data.byteLength} bytes`);
    }

}