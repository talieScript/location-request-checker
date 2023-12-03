require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to fetch data from a table
async function fetchData() {
  try {
    const { data, error } = await supabase.from('your_table_name').select('*');
    if (error) {
      throw error;
    }
    console.log('Data fetched successfully:', data);
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

// Function to insert data into a table
async function insertData(dataToInsert) {
  try {
    const { data, error } = await supabase
      .from('your_table_name')
      .insert(dataToInsert);
    if (error) {
      throw error;
    }
    console.log('Data inserted successfully:', data);
  } catch (error) {
    console.error('Error inserting data:', error.message);
  }
}

// Example usage
fetchData(); // Fetch data from the table
insertData({ column1: 'value1', column2: 'value2' }); // Insert data into the table
