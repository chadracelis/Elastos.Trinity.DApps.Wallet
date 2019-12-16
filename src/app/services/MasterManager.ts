/*
 * Copyright (c) 2019 Elastos Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { NgZone } from '@angular/core';
import { Native } from "./Native";
import { Config } from "./Config";
import { Util } from "./Util";
import { WalletManager } from "./WalletManager";
import { Events } from '@ionic/angular';
import { LocalStorage } from './Localstorage';

export class MasterManager {

    // public curMasterId: string = "1";
    public subWallet = {};
    public name: string = '';

    public masterWallet: any = {};
    public curMasterId: string = "-1";
    public curMaster: any = {};
    public masterInfos: any = {};
    public progress: any = {};
    public masterList: any = {};

    constructor(public native: Native,
        public localStorage: LocalStorage,
        public zone: NgZone, public walletManager: WalletManager) {
        this.init();
    }

    init() {
        console.log("Master manager is initializing");

        this.localStorage.getMasterInfos((infos) => {
            console.log("Got master infos", infos);

            if (infos != null) {
                this.masterInfos = infos;
            }
            else {
                console.warn("Empty Master info returned!");
            }

            this.localStorage.getProgress((progress) => {
                console.log("Got progress", progress);

                if (progress) {
                    this.progress = progress;
                }
                this.walletManager.getAllMasterWallets((ret) => this.successHandle(ret), (err) => this.errorHandle(err));
            });
        });
    }

    successHandle(idList) {
        this.masterList = idList;

        console.log("Master list:", this.masterList);

        if (idList.length === 0) {
            this.handleNull();
            return;
        }

        if (idList.length != Object.keys(this.masterInfos).length) 
            console.error("Local storage wallet list and SPVSDK list have different sizes!");

        for (var i = 0; i < idList.length; i++) {
            let id = idList[i];
            if (this.masterInfos[id]) {
                this.masterWallet[id] = this.masterInfos[id];
                this.getMasterWalletBasicInfo(id);
            }
        }
    }

    public errorHandle(error) {
        this.native.hideLoading();
        if (error["code"] === 10002) {
            this.handleNull();
        }
    }


    handleNull() {
        this.native.setRootRouter('/launcher');
    }

    getMasterWalletBasicInfo(masterId, isAdd = false) {
        console.log("Getting basic wallet info for wallet:", masterId);

        this.walletManager.getMasterWalletBasicInfo(masterId, (ret) => {
            this.masterWallet[masterId].account = ret;
            this.getAllSubWallets(masterId, isAdd)
        });
    }

    public getAllSubWallets(masterId, isAdd = false) {
        console.log("Getting all subwallets for wallet:", masterId);

        this.walletManager.getAllSubWallets(masterId, (data) => {
            this.masterWallet[masterId].chainList = [];
            if (!this.masterWallet[masterId]["subWallet"]) {
                this.masterWallet[masterId].subWallet = {};
            }
            for (let index in data) {
                let chainId = data[index];
                this.addSubWallet(masterId, chainId);
            }

            if (this.curMasterId == "-1") {
                this.localStorage.getCurMasterId((data) => {
                    if (data && data["masterId"] && this.masterList.indexOf(data["masterId"]) > -1) {
                        this.curMasterId = data["masterId"]
                    }
                    else {
                        this.curMasterId = this.masterList[0];
                    }
                    Config.curMaster = this.masterWallet[this.curMasterId];
                    Config.setCurMasterWalletId(this.curMasterId);

                    this.native.setRootRouter("/tabs");
                    return;
                });
            }

            if (isAdd) {
                this.saveInfos();
                this.setCurMasterId(masterId);
            }
        });
    }

    public getWalletBalance(masterId, chainId) {
        this.walletManager.getBalance(masterId, chainId, Config.total, (data) => {
            this.zone.run(() => {
                this.masterWallet[masterId].subWallet[chainId].balance = parseInt(data) / Config.SELA;
            });
        });
    }

    public addMasterWallet(id, name) {
        this.masterWallet[id] = { name: name};
        this.masterList.push(id);
        this.getMasterWalletBasicInfo(id, true);
    }

    destroyMasterWallet(id) {
        this.walletManager.destroyWallet(id, () => {
            this.masterWallet[id] = null;
            for (var i = 0; i < this.masterList.length; i++) {
                if (this.masterList[i] == id) {
                    this.masterList.splice(i, 1);
                    break;
                }
            }
            this.saveInfos();
            if (this.masterList.length > 0) {
                this.setCurMasterId(this.masterList[0]);
            }
            else {
                this.handleNull();
            }
        });
    }

    public saveInfos() {
        this.localStorage.setMasterInfos(this.masterWallet);
    }

    public setCurMasterId(id) {
        if (id != this.curMasterId) {
            this.localStorage.saveCurMasterId({ masterId: id }).then((data) => {
                this.curMasterId = id;
                Config.curMaster = this.masterWallet[id];
                this.native.setRootRouter("/tabs");
            });
        }
    }

    public getCurMasterId() {
        return this.curMasterId;
    }

    public addSubWallet(masterId, chainId) {
        this.masterWallet[masterId].chainList.push(chainId);
        if (!this.masterWallet[masterId].subWallet[chainId]) {
            this.masterWallet[masterId].subWallet[chainId] = { balance: 0, maxHeight: 0, curHeight: 0 };
        }
        else {
            if (this.progress && this.progress[masterId] && this.progress[masterId][chainId]) {
                let maxHeight = this.progress[masterId][chainId]["maxHeight"];
                if (maxHeight) {
                    this.masterWallet[masterId].subWallet[chainId].maxHeight = maxHeight;
                }
                let curHeight = this.progress[masterId][chainId]["curHeight"];
                if (curHeight) {
                    this.masterWallet[masterId].subWallet[chainId].curHeight = curHeight;
                }
            }
        }
        this.walletManager.registerWalletListener(masterId, chainId, (ret) => {
            this.zone.run(() => {
                this.handleSubWalletCallback(ret);
            });
        });
        this.getWalletBalance(masterId, chainId);
    }

    public removeSubWallet(masterId, chainId) {
        this.zone.run(() => {
            this.masterWallet[masterId].subWallet[chainId] = null;
            for (var i = 0; i < this.masterWallet[masterId].chainList.length; i++) {
                if (this.masterWallet[masterId].chainList[i] == chainId) {
                    this.masterWallet[masterId].chainList.splice(i, 1);
                    break;
                }
            }
            console.log(this.masterWallet[masterId]);
        });
    }

    public handleSubWalletCallback(result) {
        let masterId = result["MasterWalletID"];
        let chainId = result["ChaiID"];
        let chain = this.masterWallet[masterId].subWallet[chainId];
        switch (result["Action"]) {
            case "OnTransactionStatusChanged":
                if (result['confirms'] == 1) {
                    this.getWalletBalance(masterId, chainId);
                }
                break;
            case "OnBlockSyncStarted":
                break;
            case "OnBlockSyncProgress":
                this.zone.run(() => {
                    chain.maxHeight = result["estimatedHeight"];
                    chain.curHeight = result["currentBlockHeight"];
                    this.setProgress(masterId, chainId, chain.maxHeight, chain.curHeight);
                });
                break;
            case "OnBlockSyncStopped":
                break;
            case "OnBalanceChanged":
                this.zone.run(() => {
                    chain.balance = parseInt(result["Balance"]) / Config.SELA;
                });
                break;
            case "OnTxPublished":
                this.OnTxPublished(result);
                break;
            case "OnAssetRegistered":
                break;
            case "OnConnectStatusChanged":
                break;
        }
    }

    OnTxPublished(data) {
        let hash = data["hash"];
        let result = JSON.parse(data["result"]);
        let code = result["Code"];
        let tx = "txPublished-"
        switch (code) {
            case 0:
            case 18:
                // this.popupProvider.ionicAlert_PublishedTx_sucess('confirmTitle', tx + code, hash);
                break;
            case 1:
            case 16:
            case 17:
            case 22:
            case 64:
            case 65:
            case 66:
            case 67:
                // this.popupProvider.ionicAlert_PublishedTx_fail('confirmTitle', tx + code, hash);
                break;
        }
    }

    public setProgress(masterId, coin, estimatedHeight, currentHeight) {
        if (!this.progress[masterId]) {
            this.progress[masterId] = {};
        }

        if (!this.progress[masterId][coin]) {
            this.progress[masterId][coin] = {};

        }

        this.progress[masterId][coin]["maxHeight"] = estimatedHeight;
        this.progress[masterId][coin]["curHeight"] = currentHeight;

        this.localStorage.setProgress(this.progress);
    }
}


