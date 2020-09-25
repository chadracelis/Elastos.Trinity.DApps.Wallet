import Web3 from 'web3';
import * as TrinitySDK from '@elastosfoundation/trinity-dapp-sdk'
// import { TrinitySDK } from "../../../../../../../Elastos.Trinity.DAppSDK/dist"

import { MasterWallet } from './MasterWallet';
import { SubWallet, SerializedSubWallet } from './SubWallet';
import { CoinType, CoinID, Coin, ERC20Coin, StandardCoinName } from '../Coin';
import { Util } from '../Util';
import { Transfer } from '../../services/cointransfer.service';
import BigNumber from 'bignumber.js';

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
        return this.balance; // Raw balance and display balance are the same: the number of tokens.
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
    }

    public getTransactions(startIndex: number): Promise<any> {
        // TODO: How to get all transactions that happened between a user account and a ERC20 contract?
        // Do we have to make a local cache as this may be slow to check all blocks for transactions?
        // After the SPV SDK is synced and we get all transactions, we can probably filter transfers to/from the
        // ERC20 contract and cache it.
        return Promise.resolve([]);
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

        console.log('createPaymentTransaction toAddress:', toAddress, ' amount:', amount);

        const rawTx =
        await this.masterWallet.walletManager.spvBridge.createTransferGeneric(
            this.masterWallet.id,
            contractAddress,
            '0',
            0, // WEI
            gasPrice,
            0, // WEI
            '1000000', // TODO: gasLimit
            erc20Contract.methods.transfer(toAddress, amount).encodeABI(),
        );

        console.log('Created raw ESC transaction:', rawTx);

        return rawTx;
    }

    public async signAndSendRawTransaction(transaction: string, transfer: Transfer): Promise<void> {
        console.log("ERC20 signAndSendRawTransaction transaction:", transfer);

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

    async tempInitialTestToUseERC20Stuff() {
        /*
        // Determine the nonce
        var count = await web3.eth.getTransactionCount(myAddress);
        console.log(`num transactions so far: ${count}`);

        // Who are we trying to send this token to?
        var destAddress = "0x4f...";

        // If your token is divisible to 8 decimal places, 42 = 0.00000042 of your token
        var transferAmount = 1;

        // I chose gas price and gas limit based on what ethereum wallet was recommending for a similar transaction. You may need to change the gas price!
        var rawTransaction = {
            "from": myAddress,
            "nonce": "0x" + count.toString(16),
            "gasPrice": "0x003B9ACA00",
            "gasLimit": "0x250CA",
            "to": contractAddress,
            "value": "0x0",
            "data": contract.methods.transfer(destAddress, transferAmount).encodeABI(),
            "chainId": 0x01
        };

        // Example private key (do not use): 'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109'
        // The private key must be for myAddress
        var privKey = new Buffer(my_privkey, 'hex');
        var tx = new Tx(rawTransaction);
        tx.sign(privKey);
        var serializedTx = tx.serialize();

        // Comment out these three lines if you don't really want to send the TX right now
        console.log(`Attempting to send signed tx:  ${serializedTx.toString('hex')}`);
        var receipt = await web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
        console.log(`Receipt info:  ${JSON.stringify(receipt, null, '\t')}`);

        // The balance may not be updated yet, but let's check
        balance = await contract.methods.balanceOf(myAddress).call();
        console.log(`Balance after send: ${balance}`);*/
    }
}