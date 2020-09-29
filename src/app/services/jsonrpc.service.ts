import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { StandardCoinName } from '../model/Coin';
import { Config } from '../config/Config';
import BigNumber from 'bignumber.js';

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
export class JsonRPCService {
    private mainchainRPCApiUrl = 'http://api.elastos.io:20336';
    private IDChainRPCApiUrl = 'http://api.elastos.io:20606';
    private ethscOracleRPCApiUrl = 'http://api.elastos.io:20632';

    constructor(private http: HttpClient) {
    }

    init() {
        appManager.getPreference('mainchain.rpcapi', (rpcapi) => {
            this.mainchainRPCApiUrl = rpcapi;
        });
        appManager.getPreference('sidechain.id.rpcapi', (rpcapi) => {
            this.IDChainRPCApiUrl = rpcapi;
        });
        appManager.getPreference('sidechain.eth.oracle', (rpcapi) => {
            this.ethscOracleRPCApiUrl = rpcapi;
        });
    }

    // return balance in SELA
    async getBalanceByAddress(chainID: StandardCoinName, addressArray: string[]): Promise<BigNumber> {
        const paramArray = [];
        let index = 0;

        for (const address of addressArray) {
            const param = {
                method: 'getreceivedbyaddress',
                params: {
                    address
                },
                id: index.toString()
            };
            index++;
            paramArray.push(param);
        }

        const rpcApiUrl = this.getRPCApiUrl(chainID);
        if (rpcApiUrl.length === 0) {
            return;
        }

        let balanceOfSELA = new BigNumber(0);
        const resultArray = await this.httpRequest(rpcApiUrl, paramArray);
        for (const result of resultArray) {
            balanceOfSELA  = balanceOfSELA.plus(new BigNumber(result.result).multipliedBy(Config.SELAAsBigNumber));
        }
        console.log(' debug: getBalanceByAddress:', balanceOfSELA);
        return balanceOfSELA;
    }

    async getBlockHeight(chainID: StandardCoinName) {
        const param = {
            method: 'getblockcount',
        };

        const rpcApiUrl = this.getRPCApiUrl(chainID);
        if (rpcApiUrl.length === 0) {
            return;
        }

        const blockHeight  = await this.httpRequest(rpcApiUrl, param);
        return parseInt(blockHeight, 10);
    }

    // Get the real target address for the send transaction from ethsc to mainchain.
    async getETHSCWithdrawTargetAddress(blockHeight: number, txHash: string) {
      const param = {
          method: 'getwithdrawtransactionsbyheight',
          params: {
            height: blockHeight
        },
      };

      const result  = await this.httpRequest(this.ethscOracleRPCApiUrl, param);
      for (var i = 0; i < result.length; i++) {
          if ('0x' + result[i].txid === txHash) {
              // TODO: crosschainassets has multiple value?
              // TODO: define the result type
              return result[i].crosschainassets[0].crosschainaddress;
          }
      }
      return '';
  }

    getRPCApiUrl(chainID: string) {
        let rpcApiUrl = this.mainchainRPCApiUrl;
        switch (chainID) {
            case StandardCoinName.ELA:
                break;
            case StandardCoinName.IDChain:
                rpcApiUrl = this.IDChainRPCApiUrl;
                break;
            default:
                rpcApiUrl = '';
                console.log('JsonRPCService: Can not support ' + chainID);
                break;
        }
        return rpcApiUrl;
    }

    httpRequest(rpcApiUrl: string, param: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const httpOptions = {
                headers: new HttpHeaders({
                    'Content-Type': 'application/json',
                })
            };
            this.http.post(rpcApiUrl, JSON.stringify(param), httpOptions)
            .subscribe((res: any) => {
                if (res instanceof Array) {
                    resolve(res);
                } else {
                    resolve(res.result || '');
                }
            }, (err) => {
                reject(err);
                console.log('JsonRPCService httpRequest error:', err);
            });
        });
    }
}
