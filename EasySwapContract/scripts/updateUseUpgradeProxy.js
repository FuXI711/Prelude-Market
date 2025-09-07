const { ethers, upgrades } = require("hardhat");

const esDex_name = "EasySwapOrderBook";
const esDex_address = "0xae0e4320086F06813C7a10C4f3616228e3454723"

const esVault_name = "EasySwapVault";
const esVault_address = "0x9BAa8597b54fEE7Af2DEDEE66F9133EB61C2F058"

/**  * 2024/12/22 in sepolia testnet
 * esVault contract deployed to: 0xaD65f3dEac0Fa9Af4eeDC96E95574AEaba6A2834
     esVault ImplementationAddress: 
     esVault AdminAddress: 
   esDex contract deployed to: 0xcEE5AA84032D4a53a0F9d2c33F36701c3eAD5895
      esDex ImplementationAddress:  0x5eF36e709cbdEB672554195F5E7A491Cf921E597
      esDex AdminAddress: 
 */

//use this scrips to upgrade contract if have a network file by importing previous deployments, if not use 'updateUsePerpareUpgrade' scripts
async function main() {
    const [signer, owner] = await ethers.getSigners();
    console.log(signer.address, " : signer");
    
    //测试升级的合约里面是否可以调用getVault函数
    // let esDex = await ethers.getContractFactory(esDex_name);
    // let esDexInstance = await esDex.attach(esDex_address)
    // let vault = await esDexInstance.getVault();
    // console.log(vault," vault");

    //升级合约：27-35
    // let esDex = await ethers.getContractFactory(esDex_name);
    // console.log(await upgrades.erc1967.getImplementationAddress(esDex_address), " getOldImplementationAddress")
    // console.log(await upgrades.erc1967.getAdminAddress(esDex_address), " getAdminAddress")

    // esDex = await upgrades.upgradeProxy(esDex_address, esDex);
    // esDex = await esDex.deployed();
    // console.log("esDex upgraded");
    // console.log(await upgrades.erc1967.getImplementationAddress(esDex_address), " getNewImplementationAddress")
    
    // esVault
    // let esVault = await ethers.getContractFactory(esVault_name);
    // console.log(await upgrades.erc1967.getImplementationAddress(esVault_address), " getOldImplementationAddress")
    // console.log(await upgrades.erc1967.getAdminAddress(esVault_address), " getAdminAddress")
    
    // esVault = await upgrades.upgradeProxy(esVault_address, esVault);
    // esVault = await esVault.deployed();
    // console.log("esVault upgraded");
    // console.log(await upgrades.erc1967.getImplementationAddress(esVault_address), " getNewImplementationAddress")
}


main()
    // eslint-disable-next-line no-process-exit
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    });
