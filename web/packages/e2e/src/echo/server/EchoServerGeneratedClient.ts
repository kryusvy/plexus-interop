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
import { MethodInvocationContext, Completion, ClientConnectRequest, StreamingInvocationClient, GenericClientApi, InvocationRequestInfo, InvocationClient } from "@plexus-interop/client";
import { ProvidedMethodReference, ServiceDiscoveryRequest, ServiceDiscoveryResponse, MethodDiscoveryRequest, MethodDiscoveryResponse, GenericClientApiBuilder, ValueHandler } from "@plexus-interop/client";
import { TransportConnection, UniqueId } from "@plexus-interop/transport-common";
import { Arrays, Observer, ConversionObserver } from "@plexus-interop/common";

import * as plexus from "../gen/plexus-messages";

/**
 * Main client API
 *
 */
export abstract class EchoServerClient {

    public abstract sendUnaryRequest(invocationInfo: InvocationRequestInfo, request: any, responseHandler: ValueHandler<any>, requestType: any, responseType: any): Promise<InvocationClient>;

    public abstract sendStreamingRequest(invocationInfo: InvocationRequestInfo, responseObserver: Observer<any>, requestType: any, responseType: any): Promise<StreamingInvocationClient<any>>;

    public abstract discoverService(discoveryRequest: ServiceDiscoveryRequest): Promise<ServiceDiscoveryResponse>;

    public abstract discoverMethod(discoveryRequest: MethodDiscoveryRequest): Promise<MethodDiscoveryResponse>;

    public abstract sendDiscoveredUnaryRequest(methodReference: ProvidedMethodReference, request: ArrayBuffer, responseHandler: ValueHandler<ArrayBuffer>): Promise<InvocationClient>;

    public abstract sendDiscoveredBidirectionalStreamingRequest(methodReference: ProvidedMethodReference, responseObserver: Observer<ArrayBuffer>): Promise<StreamingInvocationClient<ArrayBuffer>>;

    public abstract sendDiscoveredServerStreamingRequest(
        methodReference: ProvidedMethodReference,
        request: ArrayBuffer,
        responseObserver: Observer<ArrayBuffer>): Promise<InvocationClient>;

    public abstract disconnect(completion?: Completion): Promise<void>;

}

/**
 * Client's API internal implementation
 *
 */
class EchoServerClientImpl implements EchoServerClient {

    public constructor(
        private readonly genericClient: GenericClientApi,
    ) { }

    // Client methods ignored from coverage as all tests use EchoClient to invoke actions

    public discoverService(discoveryRequest: ServiceDiscoveryRequest): Promise<ServiceDiscoveryResponse> {
        /* istanbul ignore next */
        return this.genericClient.discoverService(discoveryRequest);
    }

    public discoverMethod(discoveryRequest: MethodDiscoveryRequest): Promise<MethodDiscoveryResponse> {
        /* istanbul ignore next */        
        return this.genericClient.discoverMethod(discoveryRequest);
    }

    public sendDiscoveredUnaryRequest(methodReference: ProvidedMethodReference, request: ArrayBuffer, responseHandler: ValueHandler<ArrayBuffer>): Promise<InvocationClient> {
        /* istanbul ignore next */        
        return this.genericClient.sendDiscoveredUnaryRequest(methodReference, request, responseHandler);
    }

    public sendDiscoveredBidirectionalStreamingRequest(methodReference: ProvidedMethodReference, responseObserver: Observer<ArrayBuffer>): Promise<StreamingInvocationClient<ArrayBuffer>> {
        /* istanbul ignore next */        
        return this.genericClient.sendDiscoveredBidirectionalStreamingRequest(methodReference, responseObserver);
    }

    public sendDiscoveredServerStreamingRequest(
        methodReference: ProvidedMethodReference,
        request: ArrayBuffer,
        responseObserver: Observer<ArrayBuffer>): Promise<InvocationClient> {
        /* istanbul ignore next */                    
        return this.genericClient.sendDiscoveredServerStreamingRequest(methodReference, request, responseObserver);
    }

    public disconnect(completion?: Completion): Promise<void> {
        return this.genericClient.disconnect(completion);
    }

    public sendUnaryRequest(invocationInfo: InvocationRequestInfo, request: any, responseHandler: ValueHandler<any>, requestType: any, responseType: any): Promise<InvocationClient> {
        /* istanbul ignore next */                        
        return this.genericClient.sendDynamicUnaryRequest(invocationInfo, request, responseHandler, requestType, responseType);
    }

    public sendStreamingRequest(invocationInfo: InvocationRequestInfo, responseObserver: Observer<any>, requestType: any, responseType: any): Promise<StreamingInvocationClient<any>> {
        /* istanbul ignore next */                        
        return this.genericClient.sendDynamicBidirectionalStreamingRequest(invocationInfo, responseObserver, requestType, responseType);
    }

}

/**
 * Client invocation handler for EchoService, to be implemented by Client
 *
 */
export abstract class EchoServiceInvocationHandler {

    public abstract onUnary(invocationContext: MethodInvocationContext, request: plexus.plexus.interop.testing.IEchoRequest): Promise<plexus.plexus.interop.testing.IEchoRequest>;

    public abstract onServerStreaming(invocationContext: MethodInvocationContext, request: plexus.plexus.interop.testing.IEchoRequest, hostClient: StreamingInvocationClient<plexus.plexus.interop.testing.IEchoRequest>): void;

    public abstract onClientStreaming(invocationContext: MethodInvocationContext, hostClient: StreamingInvocationClient<plexus.plexus.interop.testing.IEchoRequest>): Observer<plexus.plexus.interop.testing.IEchoRequest>;

    public abstract onDuplexStreaming(invocationContext: MethodInvocationContext, hostClient: StreamingInvocationClient<plexus.plexus.interop.testing.IEchoRequest>): Observer<plexus.plexus.interop.testing.IEchoRequest>;

}

/**
 * Internal invocation handler delegate for EchoService
 *
 */
class EchoServiceInvocationHandlerInternal {

    public constructor(private readonly clientHandler: EchoServiceInvocationHandler) {}

    public onUnary(invocationContext: MethodInvocationContext, request: ArrayBuffer): Promise<ArrayBuffer> {
        const responseToBinaryConverter = (from: plexus.plexus.interop.testing.IEchoRequest) => Arrays.toArrayBuffer(plexus.plexus.interop.testing.EchoRequest.encode(from).finish());
        const requestFromBinaryConverter = (from: ArrayBuffer) => {
            const decoded = plexus.plexus.interop.testing.EchoRequest.decode(new Uint8Array(from));
            return plexus.plexus.interop.testing.EchoRequest.toObject(decoded);
        };
        return this.clientHandler
            .onUnary(invocationContext, requestFromBinaryConverter(request))
            .then(response => responseToBinaryConverter(response));
    }
    
    public onServerStreaming(invocationContext: MethodInvocationContext, request: ArrayBuffer, hostClient: StreamingInvocationClient<ArrayBuffer>): void {
        const responseToBinaryConverter = (from: plexus.plexus.interop.testing.IEchoRequest) => Arrays.toArrayBuffer(plexus.plexus.interop.testing.EchoRequest.encode(from).finish());
        const requestFromBinaryConverter = (from: ArrayBuffer) => {
            const decoded = plexus.plexus.interop.testing.EchoRequest.decode(new Uint8Array(from));
            return plexus.plexus.interop.testing.EchoRequest.toObject(decoded);
        };
        this.clientHandler
            .onServerStreaming(invocationContext, requestFromBinaryConverter(request), {
                next: (response) => hostClient.next(responseToBinaryConverter(response)),
                complete: hostClient.complete.bind(hostClient),
                error: hostClient.error.bind(hostClient),
                cancel: hostClient.cancel.bind(hostClient)
            });
    }
    
    public onClientStreaming(invocationContext: MethodInvocationContext, hostClient: StreamingInvocationClient<ArrayBuffer>): Observer<ArrayBuffer> {
        const responseToBinaryConverter = (from: plexus.plexus.interop.testing.IEchoRequest) => Arrays.toArrayBuffer(plexus.plexus.interop.testing.EchoRequest.encode(from).finish());
        const requestFromBinaryConverter = (from: ArrayBuffer) => {
            const decoded = plexus.plexus.interop.testing.EchoRequest.decode(new Uint8Array(from));
            return plexus.plexus.interop.testing.EchoRequest.toObject(decoded);
        };
        const baseObserver = this.clientHandler
            .onClientStreaming(invocationContext, {
                next: (response) => hostClient.next(responseToBinaryConverter(response)),
                complete: hostClient.complete.bind(hostClient),
                error: hostClient.error.bind(hostClient),
                cancel: hostClient.cancel.bind(hostClient)
            });
        return {
            next: (value) => baseObserver.next(requestFromBinaryConverter(value)),
            complete: baseObserver.complete.bind(baseObserver),
            error: baseObserver.error.bind(baseObserver)
        };
    }
    
    public onDuplexStreaming(invocationContext: MethodInvocationContext, hostClient: StreamingInvocationClient<ArrayBuffer>): Observer<ArrayBuffer> {
        const responseToBinaryConverter = (from: plexus.plexus.interop.testing.IEchoRequest) => Arrays.toArrayBuffer(plexus.plexus.interop.testing.EchoRequest.encode(from).finish());
        const requestFromBinaryConverter = (from: ArrayBuffer) => {
            const decoded = plexus.plexus.interop.testing.EchoRequest.decode(new Uint8Array(from));
            return plexus.plexus.interop.testing.EchoRequest.toObject(decoded);
        };
        const baseObserver = this.clientHandler
            .onDuplexStreaming(invocationContext, {
                next: (response) => hostClient.next(responseToBinaryConverter(response)),
                complete: hostClient.complete.bind(hostClient),
                error: hostClient.error.bind(hostClient),
                cancel: hostClient.cancel.bind(hostClient)
            });
        return {
            next: (value) => baseObserver.next(requestFromBinaryConverter(value)),
            complete: baseObserver.complete.bind(baseObserver),
            error: baseObserver.error.bind(baseObserver)
        };
    }
}

/**
 * Client API builder
 *
 */
export class EchoServerClientBuilder {

    private clientDetails: ClientConnectRequest = {
        applicationId: "plexus.interop.testing.EchoServer",
        applicationInstanceId: UniqueId.generateNew()
    };

    private transportConnectionProvider: () => Promise<TransportConnection>;

    private echoServiceHandler: EchoServiceInvocationHandler;

    public withClientDetails(clientId: ClientConnectRequest): EchoServerClientBuilder {
        this.clientDetails = clientId;
        return this;
    }

    public withEchoServiceInvocationsHandler(invocationsHandler: EchoServiceInvocationHandler): EchoServerClientBuilder {
        this.echoServiceHandler = new EchoServiceInvocationHandlerInternal(invocationsHandler);
        return this;
    }

    public withTransportConnectionProvider(provider: () => Promise<TransportConnection>): EchoServerClientBuilder {
        this.transportConnectionProvider = provider;
        return this;
    }

    public connect(): Promise<EchoServerClient> {
        return new GenericClientApiBuilder()
            .withTransportConnectionProvider(this.transportConnectionProvider)
            .withClientDetails(this.clientDetails)
            .withUnaryInvocationHandler({
                serviceInfo: {
                    serviceId: "plexus.interop.testing.EchoService"
                },
                handler: {
                    methodId: "Unary",
                    handle: this.echoServiceHandler.onUnary.bind(this.echoServiceHandler)
                }
            })
            .withServerStreamingInvocationHandler({
                serviceInfo: {
                    serviceId: "plexus.interop.testing.EchoService"
                },
                handler: {
                    methodId: "ServerStreaming",
                    handle: this.echoServiceHandler.onServerStreaming.bind(this.echoServiceHandler)
                }
            })
            .withBidiStreamingInvocationHandler({
                serviceInfo: {
                    serviceId: "plexus.interop.testing.EchoService"
                },
                handler: {
                    methodId: "ClientStreaming",
                    handle: this.echoServiceHandler.onClientStreaming.bind(this.echoServiceHandler)
                }
            })
            .withBidiStreamingInvocationHandler({
                serviceInfo: {
                    serviceId: "plexus.interop.testing.EchoService"
                },
                handler: {
                    methodId: "DuplexStreaming",
                    handle: this.echoServiceHandler.onDuplexStreaming.bind(this.echoServiceHandler)
                }
            })
            .connect()
            .then(genericClient => new EchoServerClientImpl(
                genericClient
));
    }
}
