using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AiBimCost.SubTools
{
    public static class UnitChanger
    {
        public static double DegreeToRadian(double degree)
        {

            return degree / (180 / Math.PI);

        }
        public static double MmToFeet(double mm)
        {

            double _mmToFeet = 0.0032808399;
            return mm * _mmToFeet;

        }
        public static double Feet2ToM2(double feet2)
        {

            double _feet2ToM2 = 10.7639104167097;
            return feet2 / _feet2ToM2;

        }
        public static double Feet3ToM3(double feet3)
        {

            double _feet3ToM3 = 0.0283168;
            return feet3 * _feet3ToM3;

        }
        public static double M2ToFeet2(double m2)
        {

            double _Mm2ToFeet2 = 10.7639104167097;
            return m2 * _Mm2ToFeet2;

        }
        public static double FeetToMm(double feet)
        {

            double _mmToFeet = 0.0032808399;
            return feet / _mmToFeet;

        }
    }
}
