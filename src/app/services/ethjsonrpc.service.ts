import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Config } from '../config/Config';

declare let appManager: AppManagerPlugin.AppManager;

type JSONRPCResponse = {
    error: string;
    id: string;
    jsonrpc: string;
    result: string;
};

@Injectable({
    providedIn: 'root'
})
export class EthJsonRPCService {
    // private ETHSCRPCApiUrl = 'http://api.elastos.io:21636';
    private ETHSCRPCApiUrl = 'https://rpc.elaeth.io'; // TestNet
    // private ETHSCRPCApiUrl = 'https://mainrpc.elaeth.io'; // MainNet

    constructor(private http: HttpClient) {
    }

    init() {
        // appManager.getPreference('sidechain.eth.rpcapi', (rpcapi) => {
        //     this.ETHSCRPCApiUrl = rpcapi;
        // });
    }

    // getGasPrice
    async getGasPrice(id: string) {
        const param = {
            method: 'eth_gasPrice',
            params: [
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        const balanceOfSELA = parseInt(result, 16) / 10000000000;
        return balanceOfSELA;
    }

    // getGasEstimate
    async getGasEstimate(from: string, to: string, value: number, gasPrice: number, data: string, id: string) {
        const param = {
            method: 'eth_estimateGas',
            params: [
                {
                    from,
                    to,
                    gasPrice,
                    value,
                    data
                }
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        console.log(' debug: getGasEstimate:', result);
    }

    // getBalance
    async getBalance(address: string, id) {
        const param = {
            method: 'eth_getBalance',
            params: [
                address, 'latest'
            ],
            id
        };

        const balance = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        // TODO: SELA or wei
        const balanceOfSELA = parseInt(balance, 16) / 10000000000;
        console.log(' debug: getBalanceByAddress:', balanceOfSELA);
        return balanceOfSELA;
    }

    // submitTransaction
    async submitTransaction(tx: string, id: string) {
        const param = {
            method: ' eth_sendRawTransaction',
            params: [
                tx
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        return result;
    }

    // getTransactions
    async getTransactions(address: string, begBlockNumber: number, endBlockNumber: number, id: string) {
        const param = {
            method: 'eth_blockNumber',
            params: [
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        const blocNumber = parseInt(result, 16);
        return blocNumber;
    }

    // getLogs
    async getLogs(contract: string, address: string, fromBlock: number, toBlock: number, id: string) {
        const param = {
            method: 'eth_getLogs',
            params: [
                {
                    address,
                    fromBlock: fromBlock.toString(16),
                    toBlock: toBlock.toString(16),
                }
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        console.log(' debug: eth_getLogs:', result);
    }

    // getBlocks
    async getBlockNumber(id: string) {
        const param = {
            method: 'eth_blockNumber',
            params: [
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        const blocNumber = parseInt(result, 16);
        return blocNumber;
    }

    // getTokens
    async getTokens(id: string) {
        const param = {
            method: 'eth_blockNumber',
            params: [
            ],
            id
        };

        const result = await this.httpRequest(this.ETHSCRPCApiUrl, param);
        const blocNumber = parseInt(result, 16);
        return blocNumber;
    }

    // GetNonce


    httpRequest(rpcApiUrl: string, param: any): Promise<string> {
        console.log('httpRequest rpcApiUrl:', rpcApiUrl, ' param:', param);
        return new Promise((resolve, reject) => {
            const httpOptions = {
                headers: new HttpHeaders({
                    'Content-Type': 'application/json',
                })
            };
            this.http.post(rpcApiUrl, JSON.stringify(param), httpOptions)
            .subscribe(res => {
                const response = res as JSONRPCResponse;
                resolve(response.result);
            }, (err) => {
                reject(err);
                console.log('EthJsonRPCService httpRequest error:', err);
            });
        });
    }
}
