export default (sequelize, DataTypes) => {
  const Trade = sequelize.define(
    "trades",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      orderId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      txHash: {
        type: DataTypes.STRING,
        allowNull: true
      },
      withdrawTxHash: {
        type: DataTypes.STRING,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "submitted"
      },
      side: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "sell"
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "market"
      },
      quantity: {
        type: DataTypes.STRING,
        allowNull: true
      },
      price: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "0"
      },
      pairSymbol: {
        type: DataTypes.STRING,
        allowNull: true
      },
      baseToken: {
        type: DataTypes.STRING,
        allowNull: true
      },
      quoteToken: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: "trades",
      timestamps: true
    }
  );

  return Trade;
};