import Web3 from 'web3';
import * as TrinitySDK from '@elastosfoundation/trinity-dapp-sdk'
// import { TrinitySDK } from "../../../../../../../Elastos.Trinity.DAppSDK/dist"

import { MasterWallet } from './MasterWallet';
import { SubWallet, SerializedSubWallet } from './SubWallet';
import { CoinType, CoinID, Coin, ERC20Coin, StandardCoinName } from '../Coin';
import { Util } from '../Util';
import { Transfer } from '../../services/cointransfer.service';
import BigNumber from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { Transaction, TransactionDirection, TransactionInfo, TransactionType } from '../Transaction';
import moment from 'moment';

declare let appManager: AppManagerPlugin.AppManager;

export class ERC20SubWallet extends SubWallet {
    /** Coin related to this wallet */
    private coin: ERC20Coin;
    /** Web3 variables to call smart contracts */
    private web3: Web3;
    private erc20ABI: any;
    private tokenDecimals: number;

    constructor(masterWallet: MasterWallet, id: CoinID) {
        super(masterWallet, id, CoinType.ERC20);

        this.initialize();
    }

    private async initialize() {
        this.coin = this.masterWallet.coinService.getCoinByID(this.id) as ERC20Coin;
        // Get Web3 and the ERC20 contract ready
        // let trinityWeb3Provider = new Ethereum.TrinitySDK.Ethereum.Web3.Providers.TrinityWeb3Provider();
        let trinityWeb3Provider = new TrinitySDK.Ethereum.Web3.Providers.TrinityWeb3Provider();
        this.web3 = new Web3(trinityWeb3Provider);

        // Standard ERC20 contract ABI
        this.erc20ABI = require("../../../assets/ethereum/StandardErc20ABI.json");

        // First retrieve the number of decimals used by this token. this is needed for a good display,
        // as we need to convert the balance integer using the number of decimals.
        await this.fetchTokenDecimals();
        this.updateBalance();
    }

    public static newFromCoin(masterWallet: MasterWallet, coin: Coin): Promise<ERC20SubWallet> {
        let subWallet = new ERC20SubWallet(masterWallet, coin.getID());
        return Promise.resolve(subWallet);
    }

    public static newFromSerializedSubWallet(masterWallet: MasterWallet, serializedSubWallet: SerializedSubWallet): ERC20SubWallet {
        console.log("Initializing ERC20 subwallet from serialized sub wallet", serializedSubWallet);

        let subWallet = new ERC20SubWallet(masterWallet, serializedSubWallet.id);
        subWallet.initFromSerializedSubWallet(serializedSubWallet);
        return subWallet;
    }

    public async createAddress(): Promise<string> {
        // Create on ETH always returns the same unique address.
        return await this.masterWallet.walletManager.spvBridge.createAddress(this.masterWallet.id, StandardCoinName.ETHSC);
    }

    public getFriendlyName(): string {
        const coin = this.masterWallet.coinService.getCoinByID(this.id);
        if (!coin) {
            return ''; // Just in case
        }

        return coin.getDescription();
    }

    public getDisplayTokenName(): string {
        const coin = this.masterWallet.coinService.getCoinByID(this.id);
        if (!coin) {
            return ''; // Just in case
        }

        return coin.getName();
    }

    private async fetchTokenDecimals(): Promise<void> {
        let ethAccountAddress = await this.getEthAccountAddress();
        var contractAddress = this.coin.getContractAddress();
        let erc20Contract = new this.web3.eth.Contract(this.erc20ABI, contractAddress, { from: ethAccountAddress });
        this.tokenDecimals = await erc20Contract.methods.decimals().call();

        console.log(this.id+" decimals: ", this.tokenDecimals);
    }

    public getDisplayBalance(): BigNumber {
        return this.getDisplayAmount(this.balance);
    }

    public getDisplayAmount(amount: BigNumber): BigNumber {
        return amount; // Raw value and display value are the same: the number of tokens.
    }

    public getAmountInExternalCurrency(value: BigNumber): BigNumber {
        // No way to compute the actual value in currency for this token - would require to be bound to an exchange
        // to get its valuation, which we have not for now.
        return null;
    }

    /**
     * Check whether the balance is enough.
     * @param amount unit is ETHER
     */
    public isBalanceEnough(amount: BigNumber) {
        return this.balance.gt(amount);
    }

    public async updateBalance() {
        console.log("Updating ERC20 token balance for token: ", this.id);

        let ethAccountAddress = await this.getEthAccountAddress();
        var contractAddress = this.coin.getContractAddress();
        let erc20Contract = new this.web3.eth.Contract(this.erc20ABI, contractAddress, { from: ethAccountAddress });

        // TODO: what's the integer type returned by web3? Are we sure we can directly convert it to BigNumber like this? To be tested
        let balanceEla = await erc20Contract.methods.balanceOf(ethAccountAddress).call();
        // The returned balance is an int. Need to devide by the number of decimals used by the token.
        this.balance = new BigNumber(balanceEla).dividedBy(new BigNumber(10).pow(this.tokenDecimals));
        console.log(this.id+": raw balance:", balanceEla, " Converted balance: ", this.balance);

        // Update the "last sync" date. Just consider this http call date as the sync date for now
        this.timestamp = new Date().getTime();
        this.lastBlockTime = Util.dateFormat(new Date(this.timestamp), 'YYYY-MM-DD HH:mm:ss');
        this.progress = 100;

        const eventId = this.masterWallet.id + ':' + this.id + ':synccompleted';
        this.masterWallet.walletManager.events.publish(eventId, this.id);
    }

    public getTransactions(startIndex: number): Promise<any> {
        // TODO: How to get all transactions that happened between a user account and a ERC20 contract?
        // Do we have to make a local cache as this may be slow to check all blocks for transactions?
        // After the SPV SDK is synced and we get all transactions, we can probably filter transfers to/from the
        // ERC20 contract and cache it.
        return Promise.resolve([]);
    }

    // TODO: Refine / translate with more detailed info: smart contract run, cross chain transfer or ERC payment, etc
    protected async getTransactionName(transaction: Transaction, translate: TranslateService): Promise<string> {
        switch (transaction.Direction) {
            case TransactionDirection.RECEIVED:
                return "Received "+this.coin.getName();
            case TransactionDirection.SENT:
                return "Sent "+this.coin.getName();
            default:
                return "Invalid";
        }
    }

    // TODO: Refine with more detailed info: smart contract run, cross chain transfer or ERC payment, etc
    protected async getTransactionIconPath(transaction: Transaction): Promise<string> {
        if (transaction.Direction === TransactionDirection.RECEIVED) {
            return './assets/buttons/receive.png';
        } else if (transaction.Direction === TransactionDirection.SENT) {
            return './assets/buttons/send.png';
        } else if (transaction.Direction === TransactionDirection.MOVED) {
            return './assets/buttons/transfer.png';
        }

        return null;
    }

    async getEthAccountAddress(): Promise<string> {
        // "Create" actually always returns the same address because ETH sidechain accounts have only one address.
        return await this.masterWallet.walletManager.spvBridge.createAddress(this.masterWallet.id, StandardCoinName.ETHSC);
    }

    public async createWithdrawTransaction(toAddress: string, amount: number, memo: string): Promise<any> {
        return Promise.resolve([]);
    }

    public async createPaymentTransaction(toAddress: string, amount: string, memo: string): Promise<any> {
        let ethAccountAddress = await this.getEthAccountAddress();
        var contractAddress = this.coin.getContractAddress();
        let erc20Contract = new this.web3.eth.Contract(this.erc20ABI, contractAddress, { from: ethAccountAddress });
        let gasPrice = await this.web3.eth.getGasPrice();

        console.log('createPaymentTransaction toAddress:', toAddress, ' amount:', amount, 'gasPrice:', gasPrice);

        // Convert the Token amount (ex: 20 TTECH) to contract amount (=token amount (20) * 10^decimals)
        let amountWithDecimals = new BigNumber(amount).multipliedBy(new BigNumber(10).pow(this.tokenDecimals));

        let method = erc20Contract.methods.transfer(toAddress, amountWithDecimals);

        // Estimate gas cost
        let gasLimit: number = await method.estimateGas();

        const rawTx =
        await this.masterWallet.walletManager.spvBridge.createTransferGeneric(
            this.masterWallet.id,
            contractAddress,
            '0',
            0, // WEI
            gasPrice,
            0, // WEI
            gasLimit.toString(),
            method.encodeABI(),
        );

        console.log('Created raw ESC transaction:', rawTx);

        return rawTx;
    }

    public async signAndSendRawTransaction(transaction: string, transfer: Transfer): Promise<void> {
        console.log("ERC20 signAndSendRawTransaction transaction:", transaction, transfer);

        return new Promise(async (resolve)=>{
            console.log('Received raw transaction', transaction);
            let password = await this.masterWallet.walletManager.openPayModal(transfer);
            if (!password) {
                console.log("No password received. Cancelling");
                await this.masterWallet.walletManager.sendIntentResponse(transfer.action,
                    { txid: null, status: 'cancelled' }, transfer.intentId);
                resolve(null);
                return;
            }

            console.log("Password retrieved. Now signing the transaction.");

            await this.masterWallet.walletManager.native.showLoading();

            const signedTx = await this.masterWallet.walletManager.spvBridge.signTransaction(
                this.masterWallet.id,
                StandardCoinName.ETHSC,
                transaction,
                password
            );

            console.log("Transaction signed. Now publishing.");

            const publishedTransaction =
            await this.masterWallet.walletManager.spvBridge.publishTransaction(
                this.masterWallet.id,
                StandardCoinName.ETHSC,
                signedTx
            );

            this.masterWallet.walletManager.setRecentWalletId(this.masterWallet.id);

            if (!Util.isEmptyObject(transfer.action)) {
                console.log("Mode: transfer with intent action");
                this.masterWallet.walletManager.lockTx(publishedTransaction.TxHash);

                setTimeout(async () => {
                    let status = 'published';
                    let txId = publishedTransaction.TxHash;
                    const code = this.masterWallet.walletManager.getTxCode(txId);
                    if (code !== 0) {
                        txId = null;
                        status = 'error';
                    }
                    this.masterWallet.walletManager.native.hideLoading();
                    this.masterWallet.walletManager.native.toast_trans('transaction-has-been-published');
                    console.log('Sending intent response', transfer.action, { txid: txId }, transfer.intentId);
                    await this.masterWallet.walletManager.sendIntentResponse(transfer.action,
                        { txid: txId, status }, transfer.intentId);
                    appManager.close();

                    resolve();
                }, 5000); // wait for 5s for txPublished
            } else {
                console.log("Published transaction id:", publishedTransaction.TxHash);

                await this.masterWallet.walletManager.native.hideLoading();
                this.masterWallet.walletManager.native.toast_trans('transaction-has-been-published');
                await this.masterWallet.walletManager.native.setRootRouter('/wallet-home');

                resolve();
            }
        });
    }
}